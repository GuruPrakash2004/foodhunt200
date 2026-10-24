"""SQLite connection helper and schema."""
import sqlite3
from contextlib import contextmanager

from app import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS hunts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT, finished_at TEXT, budget REAL, platform TEXT, diet TEXT, address TEXT,
    status TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hunt_id INTEGER, deal_key TEXT, found_at TEXT, platform TEXT, restaurant TEXT, items TEXT,
    item_total REAL, delivery_fee REAL, platform_fee REAL, packaging_fee REAL, taxes REAL,
    other_charges REAL, discount REAL, final_payable REAL, offer TEXT, source TEXT,
    distance_km REAL, eta_min INTEGER, bill_lines TEXT, cart_calls TEXT);
CREATE INDEX IF NOT EXISTS deals_key ON deals(deal_key, found_at);
CREATE TABLE IF NOT EXISTS feedback (
    deal_key TEXT PRIMARY KEY, favorite INTEGER DEFAULT 0, rating INTEGER, note TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS hunt_events (hunt_id INTEGER PRIMARY KEY, events TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, mobile TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT, max_price REAL, active INTEGER DEFAULT 1);
"""


@contextmanager
def connect():
    con = sqlite3.connect(config.db_path())
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()
