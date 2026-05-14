from __future__ import annotations

import time
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "rf_intensity_model.joblib"
META_PATH = BASE_DIR / "model_metadata.joblib"
FALLBACK_CSV = BASE_DIR / "last24_predictions.csv"

MODIS_URL = (
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis/c6.1/csv/"
    "MODIS_C6_1_Global_24h.csv"
)
VIIRS_URL = (
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/viirs/snpp/csv/"
    "SUOMI_VIIRS_C2_Global_24h.csv"
)

IST_OFFSET = timedelta(hours=5, minutes=30)
CACHE_TTL_SECONDS = 15 * 60

REGION_BOUNDS = {
    "Global": None,
    "India": (6, 38, 68, 97),
    "USA": (24, 49, -125, -66),
    "Australia": (-44, -10, 112, 154),
    "Brazil": (-34, 5, -74, -34),
}

RISK_LABELS = {0: "Low", 1: "Medium", 2: "High"}

app = FastAPI(
    title="Wildfire Risk Prediction API",
    version="1.0.0",
    description="Near real-time wildfire risk prediction using Random Forest.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_data_cache: Dict[str, Any] = {"loaded_at": 0.0, "frame": None}


@lru_cache(maxsize=1)
def load_model() -> tuple[Any, List[str], List[int]]:
    model = joblib.load(MODEL_PATH)
    metadata = joblib.load(META_PATH)
    classes = [int(value) for value in metadata.get("classes", [])]
    return model, list(metadata["feature_cols"]), classes


def _read_remote_data() -> pd.DataFrame:
    modis = pd.read_csv(MODIS_URL)
    modis["satellite"] = "MODIS"

    viirs = pd.read_csv(VIIRS_URL)
    viirs["satellite"] = "VIIRS"

    return pd.concat([modis, viirs], ignore_index=True)


def _read_local_fallback() -> pd.DataFrame:
    if not FALLBACK_CSV.exists():
        raise FileNotFoundError("No cached wildfire data is available locally.")

    frame = pd.read_csv(FALLBACK_CSV)
    if "satellite" not in frame.columns:
        frame["satellite"] = "Cached"

    return frame


def load_fire_data() -> pd.DataFrame:
    now = time.time()
    cached = _data_cache["frame"]
    if cached is not None and now - _data_cache["loaded_at"] < CACHE_TTL_SECONDS:
        return cached.copy()

    try:
        frame = _read_remote_data()
    except Exception:
        frame = _read_local_fallback()

    _data_cache["frame"] = frame.copy()
    _data_cache["loaded_at"] = now
    return frame


def preprocess(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()

    if "acq_date" in data.columns:
        data["acq_date"] = pd.to_datetime(data["acq_date"], errors="coerce")

    if "acq_time" in data.columns:
        acq_time = data["acq_time"].astype(str).str.zfill(4)
        hour = pd.to_numeric(acq_time.str[:2], errors="coerce").fillna(0).astype(int)
        minute = pd.to_numeric(acq_time.str[2:], errors="coerce").fillna(0).astype(int)
        if "datetime_utc" not in data.columns:
            data["datetime_utc"] = data["acq_date"] + pd.to_timedelta(hour, unit="h") + pd.to_timedelta(minute, unit="m")
        data["hour"] = hour
    elif "datetime_utc" in data.columns:
        data["datetime_utc"] = pd.to_datetime(data["datetime_utc"], errors="coerce")
        data["hour"] = data["datetime_utc"].dt.hour.fillna(0).astype(int)
    else:
        data["datetime_utc"] = pd.Timestamp.utcnow().tz_localize(None)
        data["hour"] = 0

    if "datetime_ist" not in data.columns:
        data["datetime_ist"] = pd.to_datetime(data["datetime_utc"], errors="coerce") + IST_OFFSET

    numeric_columns = [
        "latitude",
        "longitude",
        "brightness",
        "scan",
        "track",
        "bright_t31",
        "frp",
        "hour",
        "type",
        "confidence",
    ]
    for column in numeric_columns:
        if column in data.columns:
            data[column] = pd.to_numeric(data[column], errors="coerce")

    if "type" not in data.columns:
        data["type"] = 0

    cutoff = datetime.utcnow() - timedelta(hours=24)
    if "datetime_utc" in data.columns:
        data = data[pd.to_datetime(data["datetime_utc"], errors="coerce") >= cutoff]

    return data.dropna(subset=["latitude", "longitude", "frp"]).copy()


def predict_risk(frame: pd.DataFrame) -> pd.DataFrame:
    model, feature_cols, _ = load_model()
    data = frame.copy()

    for column in feature_cols:
        if column not in data.columns:
            data[column] = 0

    if data.empty:
        data["predicted_class"] = []
        data["risk_label"] = []
        data["risk_score"] = []
        if hasattr(model, "predict_proba"):
            data["prediction_confidence"] = []
        return data

    features = data[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0)
    data["predicted_class"] = model.predict(features)
    data["risk_label"] = data["predicted_class"].map(RISK_LABELS).fillna("Low")

    frp_max = float(data["frp"].max()) if not data.empty else 0.0
    confidence = pd.to_numeric(data.get("confidence", 0), errors="coerce").fillna(0)
    frp_denominator = frp_max if frp_max > 0 else 1.0

    data["risk_score"] = (
        (pd.to_numeric(data["frp"], errors="coerce").fillna(0) / frp_denominator) * 70
        + (confidence / 100.0) * 30
    ).clip(0, 100)

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(features)
        predicted_indices = data["predicted_class"].astype(int).clip(lower=0, upper=probabilities.shape[1] - 1)
        data["prediction_confidence"] = [float(probabilities[i, class_index]) for i, class_index in enumerate(predicted_indices)]

    return data


def filter_fire_frame(
    frame: pd.DataFrame,
    region: str,
    risk_levels: List[str],
    min_frp: float,
    min_confidence: float,
) -> pd.DataFrame:
    data = frame.copy()

    if risk_levels:
        data = data[data["risk_label"].isin(risk_levels)]

    bounds = REGION_BOUNDS.get(region)
    if bounds:
        lat_min, lat_max, lon_min, lon_max = bounds
        data = data[
            (data["latitude"] >= lat_min)
            & (data["latitude"] <= lat_max)
            & (data["longitude"] >= lon_min)
            & (data["longitude"] <= lon_max)
        ]

    data = data[(data["frp"] >= min_frp) & (data["confidence"] >= min_confidence)]
    return data.copy()


def _series_to_points(series: pd.Series, label_name: str = "label", value_name: str = "value") -> List[Dict[str, Any]]:
    return [{label_name: str(index), value_name: int(value)} for index, value in series.items()]


def _records(frame: pd.DataFrame) -> List[Dict[str, Any]]:
    output = frame.copy()
    for column in ["datetime_utc", "datetime_ist"]:
        if column in output.columns:
            output[column] = pd.to_datetime(output[column], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")
    return output.replace({pd.NA: None}).to_dict(orient="records")


def build_dashboard_payload(
    region: str,
    risk_levels: List[str],
    min_frp: float,
    min_confidence: float,
    limit: int,
) -> Dict[str, Any]:
    raw = load_fire_data()
    processed = predict_risk(preprocess(raw))
    filtered = filter_fire_frame(processed, region, risk_levels, min_frp, min_confidence)

    if filtered.empty:
        empty_counts = {label: 0 for label in ["Low", "Medium", "High"]}
        return {
            "generatedAtUtc": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "generatedAtIst": (datetime.utcnow() + IST_OFFSET).strftime("%Y-%m-%d %H:%M:%S"),
            "region": region,
            "filters": {
                "riskLevels": risk_levels,
                "minFrp": min_frp,
                "minConfidence": min_confidence,
                "limit": limit,
            },
            "summary": {
                "totalDetections": 0,
                "highRisk": 0,
                "mediumRisk": 0,
                "lowRisk": 0,
                "avgRiskScore": 0,
                "maxRiskScore": 0,
                "p95RiskScore": 0,
            },
            "riskDistribution": _series_to_points(pd.Series(empty_counts), "label", "count"),
            "hourlyUtc": [],
            "hourlyIst": [],
            "satelliteCounts": [],
            "recentDetections": [],
            "highRiskEvents": [],
            "mapPoints": [],
        }

    filtered = filtered.sort_values("datetime_utc", ascending=False)
    recent = filtered.head(limit)
    high_risk = filtered[filtered["risk_label"] == "High"].sort_values("risk_score", ascending=False)

    risk_distribution = filtered["risk_label"].value_counts().reindex(["Low", "Medium", "High"], fill_value=0)

    hourly_utc = (
        filtered.assign(hour_utc=pd.to_datetime(filtered["datetime_utc"]).dt.hour)
        .groupby("hour_utc")
        .size()
        .reindex(range(24), fill_value=0)
    )
    hourly_ist = (
        filtered.assign(hour_ist=pd.to_datetime(filtered["datetime_ist"]).dt.hour)
        .groupby("hour_ist")
        .size()
        .reindex(range(24), fill_value=0)
    )
    satellite_counts = filtered["satellite"].value_counts()

    frp_max = float(filtered["frp"].max()) if not filtered.empty else 1.0
    map_points = []
    for _, row in recent.iterrows():
        risk_color = {"High": "#ff4d4d", "Medium": "#ff9f43", "Low": "#2dd4bf"}.get(row["risk_label"], "#60a5fa")
        map_points.append(
            {
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "radius": max(5, min(22, (float(row["frp"]) / (frp_max or 1.0)) * 18 + 5)),
                "color": risk_color,
                "label": row["risk_label"],
                "satellite": row.get("satellite", "Unknown"),
                "frp": float(row["frp"]),
                "confidence": float(row.get("confidence", 0) or 0),
                "datetimeIst": row["datetime_ist"].strftime("%Y-%m-%d %H:%M:%S") if pd.notna(row["datetime_ist"]) else None,
            }
        )

    summary = {
        "totalDetections": int(len(filtered)),
        "highRisk": int((filtered["risk_label"] == "High").sum()),
        "mediumRisk": int((filtered["risk_label"] == "Medium").sum()),
        "lowRisk": int((filtered["risk_label"] == "Low").sum()),
        "avgRiskScore": round(float(filtered["risk_score"].mean()), 2),
        "maxRiskScore": round(float(filtered["risk_score"].max()), 2),
        "p95RiskScore": round(float(filtered["risk_score"].quantile(0.95)), 2),
    }

    return {
        "generatedAtUtc": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "generatedAtIst": (datetime.utcnow() + IST_OFFSET).strftime("%Y-%m-%d %H:%M:%S"),
        "region": region,
        "filters": {
            "riskLevels": risk_levels,
            "minFrp": min_frp,
            "minConfidence": min_confidence,
            "limit": limit,
        },
        "summary": summary,
        "riskDistribution": _series_to_points(risk_distribution, "label", "count"),
        "hourlyUtc": _series_to_points(hourly_utc, "hour", "count"),
        "hourlyIst": _series_to_points(hourly_ist, "hour", "count"),
        "satelliteCounts": _series_to_points(satellite_counts, "satellite", "count"),
        "recentDetections": _records(recent),
        "highRiskEvents": _records(high_risk.head(12)),
        "mapPoints": map_points,
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    model, _, classes = load_model()
    return {
        "status": "ok",
        "modelType": type(model).__name__,
        "classes": classes,
        "cachedDataAgeSeconds": round(time.time() - _data_cache["loaded_at"], 1) if _data_cache["frame"] is not None else None,
    }


@app.get("/api/dashboard")
def dashboard(
    region: str = Query("Global"),
    risks: str = Query("Low,Medium,High"),
    min_frp: float = Query(0.0, ge=0.0),
    min_confidence: float = Query(0.0, ge=0.0, le=100.0),
    limit: int = Query(1500, ge=1, le=2000),
) -> Dict[str, Any]:
    if region not in REGION_BOUNDS:
        raise HTTPException(status_code=400, detail=f"Unknown region '{region}'.")

    risk_levels = [item.strip() for item in risks.split(",") if item.strip()]
    valid_risks = {"Low", "Medium", "High"}
    risk_levels = [risk for risk in risk_levels if risk in valid_risks]
    if not risk_levels:
        risk_levels = ["Low", "Medium", "High"]

    return build_dashboard_payload(region, risk_levels, min_frp, min_confidence, limit)


@app.get("/api/regions")
def regions() -> Dict[str, Any]:
    return {
        "regions": list(REGION_BOUNDS.keys()),
        "riskLevels": ["Low", "Medium", "High"],
    }


# Serve React frontend static files in production
_FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Catch-all route: serve the React SPA for any non-API path."""
        index = _FRONTEND_DIST / "index.html"
        return FileResponse(str(index))
