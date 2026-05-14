# Wildfire Risk Prediction Dashboard (Major Project)

A comprehensive, near real-time wildfire monitoring and risk assessment system leveraging satellite data from NASA FIRMS and Machine Learning.

## 🚀 Overview
This project represents a year-long research and development effort into automated wildfire detection and risk stratification. By fusing data from multiple satellite instruments (**MODIS** and **VIIRS**) and applying a **Random Forest Classifier**, the system provides decision support for disaster management authorities.

## 🧠 Methodology & Architecture

### 1. Data Ingestion
- **Source**: NASA FIRMS (Fire Information for Resource Management System).
- **Instruments**:
  - **MODIS (Moderate Resolution Imaging Spectroradiometer)**: 1km resolution, specialized in high-intensity thermal detection.
  - **VIIRS (Visible Infrared Imaging Radiometer Suite)**: 375m resolution, providing finer spatial detail and detection of smaller fires.
- **Frequency**: Data is fetched every 15 minutes via NASA's CSV export endpoints.

### 2. Machine Learning Model
- **Algorithm**: Random Forest Classifier.
- **Classes**:
  - **Low Risk**: Likely controlled burns or agricultural activity.
  - **Medium Risk**: Fires requiring active monitoring.
  - **High Risk**: Severe wildfire events requiring immediate intervention.
- **Features**: Latitude, Longitude, Brightness, Scan/Track, T31 Brightness, Fire Radiative Power (FRP), Hour of Day, and Confidence.

### 3. Risk Scoring Engine
The system implements a composite risk scoring index:
`Risk Score = (FRP_normalized × 0.70) + (Confidence × 0.30)`
This formula ensures that high-energy fires (High FRP) are prioritized while filtering out low-confidence detections (potential sensor noise).

## 💻 Tech Stack
- **Backend**: Python, FastAPI, Scikit-learn, Pandas.
- **Frontend**: React, Vite, Leaflet (Maps), Recharts (Analytics), Vanilla CSS (Custom Design System).
- **Deployment**: Background uvicorn process and Vite development server.

## 🛠️ Setup & Execution

### Prerequisites
- Python 3.9+
- Node.js & npm

### Installation
1. **Clone the repository** (if applicable).
2. **Backend Setup**:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```
3. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   ```

### Running the Project
Use the provided `start.sh` script (Unix) or run the commands manually:
- **Backend**: `uvicorn backend.main:app --host 127.0.0.1 --port 8000`
- **Frontend**: `cd frontend && npm run dev`

## 📊 Dashboard Features
- **Real-time Map**: Interactive visualization with FRP-weighted markers and heatmaps.
- **Temporal Analysis**: Comparison of fire detection patterns across UTC and IST timezones.
- **Decision Support**: Automated alerts and recommendations based on current risk levels.
- **Satellite Comparison**: Comparative analysis of MODIS vs VIIRS detection performance.

## 📜 Academic Significance
This project explores the intersection of remote sensing and supervised learning. It addresses the critical need for low-latency disaster intelligence by automating the classification of thermal anomalies detected by orbital sensors.

---
*Created as a Year-Long Major Project (2025-2026)*
