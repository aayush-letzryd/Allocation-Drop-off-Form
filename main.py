import os
import psycopg2
from psycopg2 import pool
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any
import logging

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LetzRyd Partner Allocation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────
# Connection Pool
# ─────────────────────────────────────────────────────────
try:
    postgreSQL_pool = psycopg2.pool.SimpleConnectionPool(
        1, 20,
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASS", r"8S5]U3@L^Xz)\FH}"),
        host=os.environ.get("DB_HOST", "35.200.196.113"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME", "postgres")
    )
    if postgreSQL_pool:
        print("[OK] Connection pool created successfully")
except (Exception, psycopg2.DatabaseError) as error:
    print("[ERROR] Error connecting to PostgreSQL:", error)

# ─────────────────────────────────────────────────────────
# Startup — Tables + Seed Data
# ─────────────────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    conn = postgreSQL_pool.getconn()
    try:
        cur = conn.cursor()
        
        # ── cities ──────────────────────────────────────
        cur.execute("CREATE TABLE IF NOT EXISTS cities (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE);")
        cur.execute("SELECT COUNT(*) FROM cities;")
        if cur.fetchone()[0] == 0:
            cur.execute("INSERT INTO cities (name) VALUES ('Hyderabad'), ('Bangalore'), ('Mumbai'), ('Chennai'), ('Delhi') ON CONFLICT (name) DO NOTHING;")
            print("[OK] Cities seeded")

        # ── vehicle_allocation ───────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vehicle_allocation (
                id SERIAL PRIMARY KEY,
                allocation_date VARCHAR(50),
                allocation_type VARCHAR(50),
                city_name VARCHAR(100),
                driver_id VARCHAR(50),
                driver_name VARCHAR(255),
                driver_phone VARCHAR(50),
                driver_plan VARCHAR(100),
                type_of_plan VARCHAR(100),
                car_model VARCHAR(100),
                vehicle_number VARCHAR(100),
                old_vehicle_number VARCHAR(100),
                dropoff_odometer VARCHAR(50),
                dropoff_remarks TEXT,
                dropoff_photo TEXT,
                is_migrated BOOLEAN NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)
        conn.commit()
        cur.close()
        print("[OK] Database setup complete")
    except Exception as e:
        print(f"[ERROR] Startup error: {e}")
        conn.rollback()
    finally:
        postgreSQL_pool.putconn(conn)

# ─────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────
class AllocationData(BaseModel):
    allocation_date: str
    allocation_type: str
    city_name: str
    driver_id: str
    driver_name: str
    driver_phone: str
    driver_plan: Optional[str] = None
    type_of_plan: Optional[str] = None
    car_model: Optional[str] = None
    vehicle_number: str
    
    # Conditional Dropoff Fields
    old_vehicle_number: Optional[str] = None
    dropoff_odometer: Optional[str] = None
    dropoff_remarks: Optional[str] = None
    dropoff_photo: Optional[Any] = None

def extract_image(val: Any) -> Optional[str]:
    if val is None: return None
    if isinstance(val, list) and len(val) > 0:
        first = val[0]
        return first.get("content") if isinstance(first, dict) else str(first)
    return val if isinstance(val, str) and val.startswith("data:") else None

# ─────────────────────────────────────────────────────────
# Cities API
# ─────────────────────────────────────────────────────────
@app.get("/api/cities")
def get_all_cities():
    conn = postgreSQL_pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM cities ORDER BY id;")
        return [{"value": r[1], "text": r[1]} for r in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error: {e}")
        return [] 
    finally:
        postgreSQL_pool.putconn(conn)

# ─────────────────────────────────────────────────────────
# Allocation API: List
# ─────────────────────────────────────────────────────────
@app.get("/api/allocation")
def get_all_allocations():
    conn = postgreSQL_pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vehicle_allocation ORDER BY id DESC;")
        cols = [d[0] for d in cur.description]
        result = [dict(zip(cols, row)) for row in cur.fetchall()]
        return result
    finally:
        postgreSQL_pool.putconn(conn)

# ─────────────────────────────────────────────────────────
# Allocation API: Single
# ─────────────────────────────────────────────────────────
@app.get("/api/allocation/{id}")
def get_allocation(id: int):
    conn = postgreSQL_pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vehicle_allocation WHERE id = %s;", (id,))
        r = cur.fetchone()
        if not r: raise HTTPException(status_code=404, detail="Record not found")
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, r))
    finally:
        postgreSQL_pool.putconn(conn)

# ─────────────────────────────────────────────────────────
# Allocation API: Create
# ─────────────────────────────────────────────────────────
@app.post("/api/allocation")
def create_allocation(data: AllocationData):
    conn = postgreSQL_pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO vehicle_allocation (
                allocation_date, allocation_type, city_name, driver_id, driver_name, 
                driver_phone, driver_plan, type_of_plan, car_model, vehicle_number, 
                old_vehicle_number, dropoff_odometer, dropoff_remarks, dropoff_photo
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id;
        """, (
            data.allocation_date, data.allocation_type, data.city_name, data.driver_id, data.driver_name,
            data.driver_phone, data.driver_plan, data.type_of_plan, data.car_model, data.vehicle_number,
            data.old_vehicle_number, data.dropoff_odometer, data.dropoff_remarks,
            extract_image(data.dropoff_photo)
        ))
        new_id = cur.fetchone()[0]
        conn.commit()
        return {"success": True, "id": new_id}
    finally:
        postgreSQL_pool.putconn(conn)

# ─────────────────────────────────────────────────────────
# Static files
# ─────────────────────────────────────────────────────────
app.mount("/", StaticFiles(directory=".", html=True), name="static")