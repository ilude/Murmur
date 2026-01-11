# Meshtastic Site Planner: LOS Simulation Reference

This document details how [site.meshtastic.org](https://site.meshtastic.org) implements Line of Sight (LOS) and radio propagation simulations.

## Overview

The Meshtastic Site Planner uses **SPLAT!** software implementing the **ITM (Irregular Terrain Model) / Longley-Rice** propagation model, with terrain data sourced from **NASA SRTM** via **AWS Open Data**.

## Core Technology

### SPLAT! RF Propagation Engine

**SPLAT!** (Signal Propagation, Loss, And Terrain analysis tool) is the foundation of the LOS calculations.

| Property | Value |
|----------|-------|
| Author | John A. Magliacane (KD2BD) |
| License | GNU GPL v2 |
| Frequency Range | 20 MHz to 20 GHz |
| Official Website | https://www.qsl.net/kd2bd/splat.html |
| Wikipedia | https://en.wikipedia.org/wiki/SPLAT! |

SPLAT! implements two propagation models:
1. **Longley-Rice Irregular Terrain Model (ITM)** - The primary model used
2. **Irregular Terrain With Obstructions (ITWOM v3.0)** - Enhanced version

The ITM model was developed by Anita Longley and Phil Rice in 1968. It combines electromagnetic theory with statistical analysis of terrain features and radio measurements to predict median signal attenuation as a function of distance and signal variability in time and space.

### Application Stack

**Backend:**
- FastAPI (Python 3.11)
- Redis for task queue and result storage
- boto3 for AWS S3 interaction
- diskcache for terrain tile caching

**Frontend:**
- Vue.js with TypeScript
- Vite build tool
- Leaflet.js for mapping
- GeoRasterLayer-for-Leaflet for GeoTIFF visualization

**Infrastructure:**
- Docker Compose multi-container deployment
- NGINX reverse proxy
- Let's Encrypt SSL automation

## Terrain/Elevation Data

### Data Source

**NASA SRTM (Shuttle Radar Topography Mission)** elevation data via AWS Open Data:

| Property | Value |
|----------|-------|
| S3 Bucket | `elevation-tiles-prod` (us-east-1) |
| Format | `.hgt` files (Height format) |
| Resolution | 1-arcsecond (~30m) to 3-arcsecond (~90m) |
| Coverage | Global |
| Access | Public, no authentication required |

**AWS Registry:** https://registry.opendata.aws/terrain-tiles/

### Terrain Data Pipeline

1. **Tile Calculation**: `_calculate_required_terrain_tiles()` determines needed tiles based on transmitter location and coverage radius

2. **Download**: Tiles fetched from AWS S3 as compressed `.hgt.gz` files

3. **Conversion**: `_convert_hgt_to_sdf()` decompresses and converts HGT files to SPLAT!'s native SDF format

4. **Caching**: `diskcache.Cache` implements LRU eviction to store processed tiles

### Terrain Model Limitations

- SRTM accuracy is approximately 90 meters
- Does **not** account for:
  - Trees and vegetation
  - Buildings and artificial structures
  - Transient effects (precipitation, atmospheric conditions)
- Users can partially compensate by entering "clutter height" (average obstruction height)

## API Architecture

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/predict` | POST | Accepts prediction parameters, returns task UUID |
| `/status/{task_id}` | GET | Returns task state (processing/completed/failed) |
| `/result/{task_id}` | GET | Returns GeoTIFF coverage map |

### Asynchronous Processing Flow

```
┌─────────────┐     POST /predict      ┌─────────────┐
│   Vue.js    │ ────────────────────▶  │   FastAPI   │
│  Frontend   │                        │   Backend   │
└─────────────┘                        └──────┬──────┘
       │                                      │
       │                                      ▼
       │                               ┌─────────────┐
       │  Poll /status & /result       │    Redis    │
       │◀─────────────────────────────│  Task Queue │
       │                               └──────┬──────┘
       │                                      │
       ▼                                      ▼
┌─────────────┐                        ┌─────────────┐
│   Leaflet   │◀──── GeoTIFF ─────────│   SPLAT!    │
│  Map Render │                        │   Engine    │
└─────────────┘                        └─────────────┘
```

1. Frontend submits `CoveragePredictionRequest` to `/predict`
2. FastAPI generates UUID, sets Redis status to "processing"
3. `BackgroundTasks` queues `run_splat()` asynchronously
4. SPLAT! executes ITM propagation calculations
5. Results stored in Redis as GeoTIFF (1 hour expiration)
6. Frontend polls `/status` and `/result` until completion
7. Vue.js `parseGeoraster()` converts GeoTIFF to Leaflet overlay

## Configuration Parameters

### Transmitter Parameters

| Parameter | Units | Default | Notes |
|-----------|-------|---------|-------|
| Site Name | Text | None | Optional identifier |
| Latitude/Longitude | Decimal Degrees | None | Transmitter location |
| Antenna Height | Meters | 2 m | Includes mast/tower height |
| Transmit Power | Watts | 0.1 W | Region-dependent; 30 dBm default |
| Frequency | MHz | 907 MHz | Region-specific setting |
| Antenna Gain | dBi | 2.15 dBi | Isotropic antenna assumption |

### Receiver Parameters

| Parameter | Units | Default | Notes |
|-----------|-------|---------|-------|
| Sensitivity | dBm | -130 dBm | Channel-dependent; LongFast default |
| Height AGL | Meters | 1.0 m | Handheld receiver height |
| Antenna Gain | dBi | 2.15 dBi | Isotropic antenna |
| Cable Loss | dB | 2 dB | Signal attenuation factor |

### Channel Sensitivities

| Channel | Sensitivity |
|---------|-------------|
| SHORT_TURBO | ~-126 dBm |
| LongFast (default) | -130 dBm |
| VERY_LONG_SLOW | ~-147.5 dBm |

### Environmental Parameters

| Parameter | Units | Default | Range |
|-----------|-------|---------|-------|
| Radio Climate | Text | Continental Temperate | 7 climate zones |
| Polarization | Text | Vertical | Horizontal/Vertical |
| Clutter Height | Meters | 0 | ≥0 |
| Ground Conductivity | S/m | 0.005 | ≥0 |
| Atmosphere Bending | N-units | 301.0 | ≥0 |

### Simulation Options

| Parameter | Units | Default | Range |
|-----------|-------|---------|-------|
| Situation Fraction | Percent | 50 | >1, ≤100 |
| Time Fraction | Percent | 90 | >1, ≤100 |
| Max Range | Kilometers | 30 | ≥1 |

> **Note:** Ranges exceeding 50 km significantly increase computation time.

## SPLAT! Configuration Files

The system generates three configuration files for each prediction:

1. **`.qth` file**: Transmitter location (coordinates, antenna height)
2. **`.lrp` file**: Propagation parameters (ITM settings, climate, frequency, power)
3. **`.dcf` file**: Color mapping (signal level contours using matplotlib colormaps)

## Output Formats

- **GeoTIFF**: Primary output for web visualization
- **PPM (Portable Pixmap)**: Raw raster output from SPLAT!
- **KML**: Geographic bounds for Google Earth compatibility

## Key Assumptions and Limitations

1. **Isotropic antennas** assumed in horizontal plane (no directional modeling)
2. **No skywave propagation** (valid above ~50 MHz)
3. **Terrain-only obstruction** (no buildings, trees, or weather effects)
4. **Line-of-sight** determined by terrain profile along great circle path
5. **90m terrain resolution** limits accuracy for fine-scale predictions

## Source Code

### Main Repository

**GitHub:** https://github.com/meshtastic/meshtastic-site-planner

Key files:
- `app/main.py` - FastAPI endpoint definitions
- `app/models/CoveragePredictionRequest.py` - Request models
- `splat/` - SPLAT! submodule
- `parameters.md` - Detailed parameter documentation
- `docker-compose.yml` - Container orchestration

### Related Projects

| Project | Description | URL |
|---------|-------------|-----|
| meshtastic_linkplanner | Archived predecessor using geoprop-py | https://github.com/meshtastic/meshtastic_linkplanner |
| mesh-mapper | Community project with Fresnel zone calculations | https://github.com/MeshEnvy/mesh-mapper |

## ITM/Longley-Rice Model

The ITM model is maintained by NTIA Institute for Telecommunication Sciences:

- **Official Source:** https://its.ntia.gov/software/itm/
- **C++ Reference Implementation:** Available with various language bindings

### Key ITM Concepts

1. **Input Parameters**: Transmitter power, frequency, antenna height, receiver sensitivity
2. **Terrain Integration**: Elevation profiles from SDF files influence signal attenuation
3. **Propagation Model**: ITM computes path loss based on terrain obstruction and atmospheric conditions
4. **Output**: Signal strength predictions at each map location

## References

- [Meshtastic Site Planner Documentation](https://meshtastic.org/docs/software/site-planner/)
- [Meshtastic Site Planner Blog Introduction](https://meshtastic.org/blog/meshtastic-site-planner-introduction/)
- [GitHub: meshtastic/meshtastic-site-planner](https://github.com/meshtastic/meshtastic-site-planner)
- [GitHub: meshtastic/meshtastic_linkplanner](https://github.com/meshtastic/meshtastic_linkplanner)
- [GitHub: MeshEnvy/mesh-mapper](https://github.com/MeshEnvy/mesh-mapper)
- [SPLAT! Official Website](https://www.qsl.net/kd2bd/splat.html)
- [SPLAT! Wikipedia](https://en.wikipedia.org/wiki/SPLAT!)
- [ITM/Longley-Rice Model (NTIA)](https://its.ntia.gov/software/itm/)
- [AWS Open Data: Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
- [DeepWiki: meshtastic-site-planner](https://deepwiki.com/meshtastic/meshtastic-site-planner)

## Comparison: Meshtastic vs Ghostwave

| Feature | Meshtastic Site Planner | Ghostwave (This Project) |
|---------|------------------------|--------------------------|
| Propagation Model | ITM/Longley-Rice via SPLAT! | Log-distance path loss |
| Terrain Data | NASA SRTM via AWS | Open-Meteo Elevation API |
| LOS Calculation | SPLAT! integrated | Fresnel zone + Earth curvature |
| Resolution | ~90m (SRTM) | ~111m (0.001° grid) |
| Processing | Server-side (Docker) | Client-side (browser) |
| Caching | Redis + diskcache | In-memory LRU cache |
