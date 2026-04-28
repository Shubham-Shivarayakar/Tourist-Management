from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import jwt
import datetime
import os
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from config import SECRET_KEY, GMAIL_USER, GMAIL_PASSWORD, OTP_EXPIRY_MIN

BASE_DIR     = os.path.dirname(__file__)
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'frontend')
DB_PATH      = os.path.join(BASE_DIR, 'tourist_safety.db')
SECRET_KEY   = 'tourist-safety-secret-key-2024'

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

# ── DB init ───────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT NOT NULL,
            email     TEXT UNIQUE NOT NULL,
            password  TEXT NOT NULL,
            role      TEXT DEFAULT 'tourist',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS locations (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER NOT NULL,
            latitude  REAL NOT NULL,
            longitude REAL NOT NULL,
            timestamp TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            message    TEXT DEFAULT 'SOS Emergency Alert',
            status     TEXT DEFAULT 'Pending',
            priority   TEXT DEFAULT 'Normal',
            source     TEXT DEFAULT 'User',
            latitude   REAL,
            longitude  REAL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS cameras (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            location   TEXT NOT NULL,
            latitude   REAL NOT NULL,
            longitude  REAL NOT NULL,
            status     TEXT DEFAULT 'Active',
            zone       TEXT DEFAULT 'Public',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS incidents (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id   INTEGER NOT NULL,
            type        TEXT NOT NULL,
            description TEXT,
            severity    TEXT DEFAULT 'Medium',
            status      TEXT DEFAULT 'Open',
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (camera_id) REFERENCES cameras(id)
        );
        CREATE TABLE IF NOT EXISTS contacts (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id  INTEGER NOT NULL,
            name     TEXT NOT NULL,
            phone    TEXT,
            email    TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS otp_store (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT NOT NULL,
            otp        TEXT NOT NULL,
            purpose    TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used       INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS trips (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            destination TEXT NOT NULL,
            start_date  TEXT,
            end_date    TEXT,
            budget      TEXT,
            preferences TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS itinerary (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id    INTEGER NOT NULL,
            day_number INTEGER NOT NULL,
            activity   TEXT NOT NULL,
            FOREIGN KEY (trip_id) REFERENCES trips(id)
        );
    ''')
    # seed admin
    c.execute("SELECT id FROM users WHERE email='admin@tourist.com'")
    if not c.fetchone():
        c.execute("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)",
                  ('Admin','admin@tourist.com','admin123','admin'))

    # seed sample cameras
    c.execute("SELECT COUNT(*) FROM cameras")
    if c.fetchone()[0] == 0:
        sample_cameras = [
            ('Gateway of India, Mumbai',      18.9220, 72.8347, 'Active',   'Tourist'),
            ('Taj Mahal Entrance, Agra',       27.1751, 78.0421, 'Active',   'Tourist'),
            ('India Gate, New Delhi',          28.6129, 77.2295, 'Active',   'Public'),
            ('Marine Drive, Mumbai',           18.9438, 72.8237, 'Active',   'Public'),
            ('Connaught Place, Delhi',         28.6315, 77.2167, 'Inactive', 'Public'),
            ('Charminar, Hyderabad',           17.3616, 78.4747, 'Active',   'Tourist'),
            ('Mysore Palace, Mysore',          12.3052, 76.6552, 'Active',   'Tourist'),
            ('Jaipur City Palace, Jaipur',     26.9258, 75.8237, 'Inactive', 'Tourist'),
            ('Varanasi Ghats, Varanasi',       25.3176, 83.0062, 'Active',   'Public'),
            ('Qutub Minar, Delhi',             28.5245, 77.1855, 'Active',   'Tourist'),
        ]
        c.executemany(
            "INSERT INTO cameras (location,latitude,longitude,status,zone) VALUES (?,?,?,?,?)",
            sample_cameras
        )
    conn.commit()
    conn.close()

# ── Middleware ────────────────────────────────────────────────────────────────

def token_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            request.user = data
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            if data.get('role') != 'admin':
                return jsonify({'error': 'Admin access required'}), 403
            request.user = data
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

# ── Static pages ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/admin')
def admin():
    return send_from_directory(FRONTEND_DIR, 'admin.html')

@app.route('/dashboard')
def dashboard():
    return send_from_directory(FRONTEND_DIR, 'dashboard.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)

# ── Email helper ──────────────────────────────────────────────────────────────

def send_otp_email(to_email, otp, purpose):
    """Send OTP via Gmail SMTP. Returns (True, '') or (False, error_msg)."""
def send_otp_email(to_email, otp, purpose):
    """Send OTP via Gmail SMTP. Tries port 587 (STARTTLS) first, then 465 (SSL)."""
    subject = '🛡️ Smart Tourist Safety – Your OTP Code'
    action  = 'complete your registration' if purpose == 'register' else 'verify your login'
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:0">
      <div style="background:linear-gradient(135deg,#1a73e8,#0d47a1);padding:2rem;text-align:center;border-radius:12px 12px 0 0">
        <span style="font-size:2.5rem">🛡️</span>
        <h2 style="color:#fff;margin:0.5rem 0 0;font-size:1.3rem">Smart Tourist Safety</h2>
      </div>
      <div style="background:#fff;padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="color:#1e293b;font-size:1rem;margin-bottom:0.5rem">Hi there 👋</p>
        <p style="color:#475569;margin-bottom:1.5rem">Use the OTP below to <strong>{action}</strong>.<br>It expires in <strong>{OTP_EXPIRY_MIN} minutes</strong>.</p>
        <div style="text-align:center;margin:1.5rem 0;padding:1.5rem;background:#f0f7ff;border-radius:10px;border:2px dashed #1a73e8">
          <div style="font-size:0.8rem;color:#64748b;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.1em">Your OTP Code</div>
          <div style="font-size:2.8rem;font-weight:900;letter-spacing:0.6rem;color:#1a73e8">{otp}</div>
        </div>
        <p style="color:#94a3b8;font-size:0.78rem;text-align:center">⏱️ Valid for {OTP_EXPIRY_MIN} minutes only<br>🔒 Never share this code with anyone</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0"/>
        <p style="color:#cbd5e1;font-size:0.72rem;text-align:center">If you didn't request this, you can safely ignore this email.</p>
      </div>
    </div>"""

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = f'Smart Tourist Safety <{GMAIL_USER}>'
    msg['To']      = to_email
    msg.attach(MIMEText(html, 'html'))

    # Try port 587 with STARTTLS first (most reliable with App Passwords)
    try:
        with smtplib.SMTP('smtp.gmail.com', 587, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        print(f"[EMAIL] OTP sent to {to_email} via port 587")
        return True, ''
    except smtplib.SMTPAuthenticationError as e:
        err587 = str(e)
        print(f"[EMAIL] Port 587 auth failed: {err587}")
    except Exception as e:
        err587 = str(e)
        print(f"[EMAIL] Port 587 failed: {err587}")

    # Fallback: try port 465 SSL
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=15) as server:
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        print(f"[EMAIL] OTP sent to {to_email} via port 465")
        return True, ''
    except smtplib.SMTPAuthenticationError as e:
        err = str(e)
        print(f"[EMAIL] Port 465 auth failed: {err}")
        if '535' in err or 'BadCredentials' in err or 'Username and Password' in err:
            return False, (
                "Gmail authentication failed (535). "
                "You must use a Gmail App Password, NOT your regular password. "
                "Steps: myaccount.google.com → Security → 2-Step Verification (enable) → App Passwords → Generate for Mail. "
                f"Current user: {GMAIL_USER}"
            )
        return False, err
    except Exception as e:
        err = str(e)
        print(f"[EMAIL] Port 465 failed: {err}")
        return False, err

def generate_otp():
    return str(random.randint(100000, 999999))

def save_otp(email, otp, purpose):
    expires = (datetime.datetime.utcnow() + datetime.timedelta(minutes=OTP_EXPIRY_MIN)).isoformat()
    conn = get_db()
    try:
        # invalidate old OTPs for same email+purpose
        conn.execute("UPDATE otp_store SET used=1 WHERE email=? AND purpose=?", (email, purpose))
        conn.execute("INSERT INTO otp_store (email,otp,purpose,expires_at) VALUES (?,?,?,?)",
                     (email, otp, purpose, expires))
        conn.commit()
    finally:
        conn.close()

def verify_otp(email, otp, purpose):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM otp_store WHERE email=? AND otp=? AND purpose=? AND used=0 ORDER BY id DESC LIMIT 1",
            (email, otp, purpose)
        ).fetchone()
        if not row:
            return False, 'Invalid OTP'
        if datetime.datetime.utcnow().isoformat() > row['expires_at']:
            return False, 'OTP has expired'
        conn.execute("UPDATE otp_store SET used=1 WHERE id=?", (row['id'],))
        conn.commit()
        return True, ''
    finally:
        conn.close()

# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route('/register/send-otp', methods=['POST'])
def register_send_otp():
    data     = request.get_json()
    name     = (data.get('name') or '').strip()
    email    = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()

    if not all([name, email, password]):
        return jsonify({'error': 'All fields are required'}), 400

    conn = get_db()
    try:
        if conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
            return jsonify({'error': 'Email already registered'}), 409
    finally:
        conn.close()

    otp = generate_otp()
    save_otp(email, otp, 'register')

    ok, err = send_otp_email(email, otp, 'register')
    if not ok:
        print(f"[EMAIL ERROR] {err}")
        return jsonify({'error': 'Failed to send OTP. Please check your email address and try again.'}), 500
    return jsonify({'message': f'OTP sent to {email}. Please check your inbox (and spam folder).'})

@app.route('/register/resend-otp', methods=['POST'])
def register_resend_otp():
    data  = request.get_json()
    email = (data.get('email') or '').strip()
    if not email:
        return jsonify({'error': 'Email required'}), 400
    conn = get_db()
    try:
        if not conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone() is None:
            pass  # email not yet registered is fine
    finally:
        conn.close()
    otp = generate_otp()
    save_otp(email, otp, 'register')
    ok, err = send_otp_email(email, otp, 'register')
    if not ok:
        return jsonify({'error': 'Failed to resend OTP. Please try again.'}), 500
    return jsonify({'message': f'New OTP sent to {email}'})

@app.route('/register/verify-otp', methods=['POST'])
def register_verify_otp():
    data     = request.get_json()
    name     = (data.get('name') or '').strip()
    email    = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()
    otp      = (data.get('otp') or '').strip()

    if not all([name, email, password, otp]):
        return jsonify({'error': 'All fields including OTP are required'}), 400

    ok, err = verify_otp(email, otp, 'register')
    if not ok:
        return jsonify({'error': err}), 400

    conn = get_db()
    try:
        conn.execute('INSERT INTO users (name,email,password) VALUES (?,?,?)', (name, email, password))
        conn.commit()
        return jsonify({'message': 'Registration successful! You can now login.'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already registered'}), 409
    finally:
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    data     = request.get_json()
    email    = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()
    conn = get_db()
    try:
        user = conn.execute('SELECT * FROM users WHERE email=? AND password=?', (email, password)).fetchone()
        if not user:
            return jsonify({'error': 'Invalid email or password'}), 401
        token = jwt.encode({
            'id': user['id'], 'name': user['name'],
            'email': user['email'], 'role': user['role'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=8)
        }, SECRET_KEY, algorithm='HS256')
        return jsonify({'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}})
    finally:
        conn.close()

# ── Location ──────────────────────────────────────────────────────────────────

@app.route('/location', methods=['POST'])
@token_required
def save_location():
    data = request.get_json()
    lat  = data.get('latitude')
    lng  = data.get('longitude')
    if lat is None or lng is None:
        return jsonify({'error': 'Latitude and longitude required'}), 400
    conn = get_db()
    try:
        conn.execute(
            'INSERT INTO locations (user_id, latitude, longitude) VALUES (?,?,?)',
            (request.user['id'], lat, lng)
        )
        conn.commit()
        return jsonify({'message': 'Location saved'})
    finally:
        conn.close()

@app.route('/location/<int:user_id>', methods=['GET'])
@admin_required
def get_user_location(user_id):
    conn = get_db()
    try:
        row = conn.execute(
            'SELECT * FROM locations WHERE user_id=? ORDER BY timestamp DESC LIMIT 1',
            (user_id,)
        ).fetchone()
        return jsonify(dict(row) if row else {})
    finally:
        conn.close()

# ── Alerts ────────────────────────────────────────────────────────────────────

@app.route('/alert', methods=['POST'])
@token_required
def create_alert():
    data    = request.get_json()
    message = data.get('message', 'SOS Emergency Alert')
    lat     = data.get('latitude')
    lng     = data.get('longitude')
    conn = get_db()
    try:
        conn.execute(
            'INSERT INTO alerts (user_id, message, latitude, longitude) VALUES (?,?,?,?)',
            (request.user['id'], message, lat, lng)
        )
        conn.commit()
        return jsonify({'message': 'SOS alert sent successfully'}), 201
    finally:
        conn.close()

@app.route('/alerts', methods=['GET'])
@admin_required
def get_alerts():
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT a.*, COALESCE(u.name,'CCTV System') as name,
                   COALESCE(u.email,'-') as email
            FROM alerts a LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
        ''').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/alerts/<int:alert_id>/resolve', methods=['PUT'])
@admin_required
def resolve_alert(alert_id):
    conn = get_db()
    try:
        conn.execute('UPDATE alerts SET status=? WHERE id=?', ('Resolved', alert_id))
        conn.commit()
        return jsonify({'message': 'Alert resolved'})
    finally:
        conn.close()

# /update-alert — legacy-compatible endpoint
@app.route('/update-alert', methods=['POST'])
@admin_required
def update_alert():
    data      = request.get_json()
    alert_id  = data.get('id')
    status    = data.get('status', 'Resolved')
    if not alert_id:
        return jsonify({'error': 'Alert ID required'}), 400
    conn = get_db()
    try:
        conn.execute('UPDATE alerts SET status=? WHERE id=?', (status, alert_id))
        conn.commit()
        return jsonify({'message': f'Alert {alert_id} updated to {status}'})
    finally:
        conn.close()

@app.route('/alerts/my', methods=['GET'])
@token_required
def my_alerts():
    conn = get_db()
    try:
        rows = conn.execute(
            'SELECT * FROM alerts WHERE user_id=? ORDER BY created_at DESC',
            (request.user['id'],)
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/users', methods=['GET'])
@admin_required
def get_users():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, name, email, role, created_at FROM users WHERE role='tourist'"
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

# ── Surveillance / Cameras ────────────────────────────────────────────────────

@app.route('/cameras', methods=['GET'])
@admin_required
def get_cameras():
    conn = get_db()
    try:
        rows = conn.execute('SELECT * FROM cameras ORDER BY id').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/add-camera', methods=['POST'])
@admin_required
def add_camera():
    data = request.get_json()
    location  = (data.get('location') or '').strip()
    latitude  = data.get('latitude')
    longitude = data.get('longitude')
    status    = data.get('status', 'Active')
    zone      = data.get('zone', 'Public')
    if not all([location, latitude, longitude]):
        return jsonify({'error': 'location, latitude and longitude are required'}), 400
    conn = get_db()
    try:
        cur = conn.execute(
            'INSERT INTO cameras (location,latitude,longitude,status,zone) VALUES (?,?,?,?,?)',
            (location, latitude, longitude, status, zone)
        )
        conn.commit()
        return jsonify({'message': 'Camera added', 'id': cur.lastrowid}), 201
    finally:
        conn.close()

@app.route('/cameras/<int:cam_id>/toggle', methods=['PUT'])
@admin_required
def toggle_camera(cam_id):
    conn = get_db()
    try:
        cam = conn.execute('SELECT status FROM cameras WHERE id=?', (cam_id,)).fetchone()
        if not cam:
            return jsonify({'error': 'Camera not found'}), 404
        new_status = 'Inactive' if cam['status'] == 'Active' else 'Active'
        conn.execute('UPDATE cameras SET status=? WHERE id=?', (new_status, cam_id))
        conn.commit()
        return jsonify({'message': f'Camera {cam_id} is now {new_status}', 'status': new_status})
    finally:
        conn.close()

@app.route('/cameras/<int:cam_id>', methods=['DELETE'])
@admin_required
def delete_camera(cam_id):
    conn = get_db()
    try:
        conn.execute('DELETE FROM cameras WHERE id=?', (cam_id,))
        conn.commit()
        return jsonify({'message': 'Camera removed'})
    finally:
        conn.close()

# ── Incident Detection ────────────────────────────────────────────────────────

INCIDENT_TYPES = [
    ('Suspicious Activity',  'Unusual movement pattern detected near camera zone', 'High'),
    ('Crowd Surge',          'Abnormal crowd density detected — possible stampede risk', 'High'),
    ('Unattended Object',    'Unattended bag/object detected in restricted area', 'Medium'),
    ('Perimeter Breach',     'Unauthorized entry detected in restricted zone', 'High'),
    ('Unsafe Zone Entry',    'Tourist entered a flagged unsafe area', 'Medium'),
    ('Night Movement',       'Unusual movement detected in low-visibility conditions', 'Low'),
]

import random

@app.route('/detect-incident', methods=['POST'])
@admin_required
def detect_incident():
    data      = request.get_json()
    camera_id = data.get('camera_id')

    conn = get_db()
    try:
        cam = conn.execute('SELECT * FROM cameras WHERE id=?', (camera_id,)).fetchone()
        if not cam:
            return jsonify({'error': 'Camera not found'}), 404
        if cam['status'] == 'Inactive':
            return jsonify({'error': 'Camera is inactive — cannot detect'}), 400

        # pick a random incident type for simulation
        inc_type, desc, severity = random.choice(INCIDENT_TYPES)

        cur = conn.execute(
            'INSERT INTO incidents (camera_id,type,description,severity) VALUES (?,?,?,?)',
            (camera_id, inc_type, desc, severity)
        )
        incident_id = cur.lastrowid

        # auto-generate a system alert for high/medium severity
        if severity in ('High', 'Medium'):
            priority = 'High' if severity == 'High' else 'Normal'
            conn.execute(
                '''INSERT INTO alerts (user_id, message, status, priority, source, latitude, longitude)
                   VALUES (?,?,?,?,?,?,?)''',
                (None,
                 f'[CCTV #{camera_id}] {inc_type} — {cam["location"]}',
                 'Pending', priority, 'CCTV',
                 cam['latitude'], cam['longitude'])
            )
        conn.commit()
        return jsonify({
            'message':     'Incident detected',
            'incident_id': incident_id,
            'type':        inc_type,
            'description': desc,
            'severity':    severity,
            'camera':      cam['location']
        }), 201
    finally:
        conn.close()

@app.route('/incidents', methods=['GET'])
@admin_required
def get_incidents():
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT i.*, c.location, c.latitude, c.longitude, c.zone
            FROM incidents i JOIN cameras c ON i.camera_id = c.id
            ORDER BY i.created_at DESC
        ''').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/incidents/<int:inc_id>/resolve', methods=['PUT'])
@admin_required
def resolve_incident(inc_id):
    conn = get_db()
    try:
        conn.execute("UPDATE incidents SET status='Resolved' WHERE id=?", (inc_id,))
        conn.commit()
        return jsonify({'message': 'Incident resolved'})
    finally:
        conn.close()

@app.route('/cameras/nearby', methods=['GET'])
@admin_required
def nearby_cameras():
    """Return cameras within ~5km of given lat/lng using bounding box."""
    try:
        lat = float(request.args.get('lat', 0))
        lng = float(request.args.get('lng', 0))
    except ValueError:
        return jsonify({'error': 'Invalid coordinates'}), 400

    delta = 0.05  # ~5km
    conn = get_db()
    try:
        rows = conn.execute(
            'SELECT * FROM cameras WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?',
            (lat - delta, lat + delta, lng - delta, lng + delta)
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

# ── Emergency Contacts ───────────────────────────────────────────────────────

@app.route('/add-contact', methods=['POST'])
@token_required
def add_contact():
    data  = request.get_json()
    name  = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    email = (data.get('email') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    conn = get_db()
    try:
        cur = conn.execute(
            'INSERT INTO contacts (user_id, name, phone, email) VALUES (?,?,?,?)',
            (request.user['id'], name, phone, email)
        )
        conn.commit()
        return jsonify({'message': 'Contact added', 'id': cur.lastrowid}), 201
    finally:
        conn.close()

@app.route('/contacts', methods=['GET'])
@token_required
def get_contacts():
    conn = get_db()
    try:
        rows = conn.execute(
            'SELECT * FROM contacts WHERE user_id=?', (request.user['id'],)
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/contacts/<int:cid>', methods=['DELETE'])
@token_required
def delete_contact(cid):
    conn = get_db()
    try:
        conn.execute('DELETE FROM contacts WHERE id=? AND user_id=?',
                     (cid, request.user['id']))
        conn.commit()
        return jsonify({'message': 'Contact deleted'})
    finally:
        conn.close()

@app.route('/alert/sos', methods=['POST'])
@token_required
def sos_alert():
    """Enhanced SOS — saves alert + simulates notifying emergency contacts."""
    data    = request.get_json()
    message = data.get('message', 'SOS Emergency Alert')
    lat     = data.get('latitude')
    lng     = data.get('longitude')
    conn = get_db()
    try:
        conn.execute(
            'INSERT INTO alerts (user_id,message,status,priority,source,latitude,longitude) VALUES (?,?,?,?,?,?,?)',
            (request.user['id'], message, 'Pending', 'High', 'User', lat, lng)
        )
        # fetch contacts to simulate notification
        contacts = conn.execute(
            'SELECT * FROM contacts WHERE user_id=?', (request.user['id'],)
        ).fetchall()
        conn.commit()
        notified = [{'name': c['name'], 'phone': c['phone'], 'email': c['email']} for c in contacts]
        return jsonify({
            'message':  'SOS alert sent successfully',
            'notified': notified,
            'count':    len(notified)
        }), 201
    finally:
        conn.close()

# ── Weather simulation ────────────────────────────────────────────────────────

@app.route('/weather', methods=['GET'])
@token_required
def get_weather():
    """Simulates weather data based on lat/lng."""
    import random, math
    lat = float(request.args.get('lat', 20))
    lng = float(request.args.get('lng', 78))

    conditions = ['Clear', 'Partly Cloudy', 'Cloudy', 'Light Rain',
                  'Heavy Rain', 'Thunderstorm', 'Fog', 'Haze']
    seed = int(abs(lat * 100 + lng * 10)) % 100
    random.seed(seed + datetime.datetime.now().hour)
    condition = random.choice(conditions)
    temp      = round(18 + random.uniform(0, 20), 1)
    humidity  = random.randint(40, 95)
    wind      = round(random.uniform(5, 45), 1)

    danger = condition in ('Heavy Rain', 'Thunderstorm')
    warning = condition in ('Light Rain', 'Fog', 'Haze')

    alerts = []
    if condition == 'Thunderstorm': alerts.append({'level':'danger', 'msg':'⛈️ Thunderstorm warning — seek shelter immediately'})
    if condition == 'Heavy Rain':   alerts.append({'level':'danger', 'msg':'🌧️ Heavy rainfall — avoid low-lying areas, flood risk'})
    if condition == 'Fog':          alerts.append({'level':'warning','msg':'🌫️ Dense fog — reduced visibility, travel with caution'})
    if condition == 'Haze':         alerts.append({'level':'warning','msg':'😶‍🌫️ Haze advisory — air quality poor, limit outdoor activity'})
    if condition == 'Light Rain':   alerts.append({'level':'info',   'msg':'🌦️ Light rain expected — carry an umbrella'})

    return jsonify({
        'condition': condition,
        'temperature': temp,
        'humidity': humidity,
        'wind_speed': wind,
        'danger': danger,
        'warning': warning,
        'alerts': alerts
    })

# ── Tour Planning ─────────────────────────────────────────────────────────────

# Destination knowledge base
DEST_DB = {
    'goa': {
        'places': ['Baga Beach','Calangute Beach','Dudhsagar Falls','Old Goa Churches','Anjuna Flea Market','Fort Aguada','Palolem Beach'],
        'food':   ['Fish Curry Rice','Bebinca','Prawn Balchão','Feni','Xacuti'],
        'tips':   ['Best season: Nov–Feb','Avoid monsoon (Jun–Sep) for beach trips','Carry sunscreen','Rent a scooter to explore'],
        'budget': {'low':'₹1500–2500/day','mid':'₹3000–5000/day','high':'₹6000+/day'},
        'safety': 'Generally safe. Avoid isolated beaches at night. Keep valuables secure.',
        'lat': 15.2993, 'lng': 74.1240
    },
    'delhi': {
        'places': ['Red Fort','Qutub Minar','India Gate','Humayun Tomb','Lotus Temple','Chandni Chowk','Akshardham'],
        'food':   ['Butter Chicken','Chole Bhature','Paranthe Wali Gali','Dahi Bhalle','Jalebi'],
        'tips':   ['Best season: Oct–Mar','Use Metro for travel','Carry water bottle','Book monuments online'],
        'budget': {'low':'₹1000–2000/day','mid':'₹2500–4000/day','high':'₹5000+/day'},
        'safety': 'Stay alert in crowded areas. Use registered taxis. Avoid isolated areas at night.',
        'lat': 28.6139, 'lng': 77.2090
    },
    'mumbai': {
        'places': ['Gateway of India','Marine Drive','Elephanta Caves','Juhu Beach','Siddhivinayak Temple','Dharavi','Colaba Causeway'],
        'food':   ['Vada Pav','Pav Bhaji','Bhel Puri','Bombay Sandwich','Modak'],
        'tips':   ['Best season: Nov–Feb','Use local trains (avoid peak hours)','Monsoon is scenic but humid','Book hotels in advance'],
        'budget': {'low':'₹1500–2500/day','mid':'₹3500–6000/day','high':'₹7000+/day'},
        'safety': 'Very safe city. Keep belongings secure in crowded areas. Avoid isolated spots at night.',
        'lat': 19.0760, 'lng': 72.8777
    },
    'jaipur': {
        'places': ['Amber Fort','Hawa Mahal','City Palace','Jantar Mantar','Nahargarh Fort','Jal Mahal','Johari Bazaar'],
        'food':   ['Dal Baati Churma','Ghewar','Laal Maas','Pyaaz Kachori','Mawa Kachori'],
        'tips':   ['Best season: Oct–Mar','Hire a local guide for forts','Bargain at bazaars','Carry cash for local markets'],
        'budget': {'low':'₹1200–2000/day','mid':'₹2500–4500/day','high':'₹5000+/day'},
        'safety': 'Safe for tourists. Be cautious of touts near monuments. Use registered guides.',
        'lat': 26.9124, 'lng': 75.7873
    },
    'kerala': {
        'places': ['Alleppey Backwaters','Munnar Tea Gardens','Periyar Wildlife Sanctuary','Kovalam Beach','Fort Kochi','Wayanad','Thekkady'],
        'food':   ['Kerala Sadya','Appam with Stew','Karimeen Pollichathu','Puttu Kadala','Payasam'],
        'tips':   ['Best season: Sep–Mar','Book houseboat in advance','Carry mosquito repellent','Respect local customs'],
        'budget': {'low':'₹1500–2500/day','mid':'₹3000–5000/day','high':'₹6000+/day'},
        'safety': 'Very safe. Follow wildlife sanctuary rules. Avoid swimming in unmarked areas.',
        'lat': 10.8505, 'lng': 76.2711
    },
    'agra': {
        'places': ['Taj Mahal','Agra Fort','Fatehpur Sikri','Mehtab Bagh','Itmad-ud-Daulah','Akbar Tomb','Kinari Bazaar'],
        'food':   ['Petha','Dalmoth','Bedai Jalebi','Mughlai Biryani','Panchi Petha'],
        'tips':   ['Visit Taj Mahal at sunrise','Book tickets online to skip queues','Hire a guide at Agra Fort','Avoid touts outside monuments'],
        'budget': {'low':'₹1000–1800/day','mid':'₹2000–3500/day','high':'₹4000+/day'},
        'safety': 'Safe but watch for touts. Use official guides. Keep passport copy handy.',
        'lat': 27.1767, 'lng': 78.0081
    },
    'manali': {
        'places': ['Rohtang Pass','Solang Valley','Hadimba Temple','Old Manali','Beas River','Naggar Castle','Kullu Valley'],
        'food':   ['Sidu','Trout Fish','Chha Gosht','Aktori','Babru'],
        'tips':   ['Best season: Oct–Jun (avoid Jul–Sep for Rohtang)','Carry warm clothes','Acclimatize before trekking','Book permits for Rohtang in advance'],
        'budget': {'low':'₹1500–2500/day','mid':'₹3000–5000/day','high':'₹6000+/day'},
        'safety': 'Safe but check weather before mountain trips. Carry first aid. Inform someone of your route.',
        'lat': 32.2396, 'lng': 77.1887
    },
    'varanasi': {
        'places': ['Dashashwamedh Ghat','Kashi Vishwanath Temple','Sarnath','Manikarnika Ghat','Ramnagar Fort','Assi Ghat','Banaras Hindu University'],
        'food':   ['Banarasi Paan','Kachori Sabzi','Lassi','Malaiyo','Thandai'],
        'tips':   ['Take a boat ride at sunrise','Attend Ganga Aarti in the evening','Wear modest clothing at temples','Bargain for boat rides'],
        'budget': {'low':'₹800–1500/day','mid':'₹2000–3500/day','high':'₹4000+/day'},
        'safety': 'Safe. Be respectful at ghats. Watch for pickpockets in crowded areas.',
        'lat': 25.3176, 'lng': 83.0062
    }
}

PREF_ACTIVITIES = {
    'adventure':  ['Trekking','River Rafting','Paragliding','Rock Climbing','Zip-lining','Bungee Jumping'],
    'cultural':   ['Museum Visit','Heritage Walk','Local Cooking Class','Folk Dance Show','Temple Tour','Art Gallery'],
    'food':       ['Street Food Tour','Local Market Visit','Restaurant Hopping','Cooking Workshop','Food Festival'],
    'nature':     ['Wildlife Safari','Bird Watching','Waterfall Trek','Botanical Garden','Sunrise Point'],
    'relaxation': ['Spa & Wellness','Beach Lounging','Yoga Session','Sunset Cruise','Meditation Retreat'],
    'shopping':   ['Local Bazaar','Handicraft Market','Souvenir Shopping','Textile Market','Antique Market']
}

def generate_itinerary(destination, days, preferences, budget):
    dest_key = destination.lower().strip()
    # fuzzy match
    matched = next((k for k in DEST_DB if k in dest_key or dest_key in k), None)
    dest_info = DEST_DB.get(matched, {})

    places   = dest_info.get('places', ['City Center','Local Market','Main Temple','Museum','Park','Viewpoint','Shopping Area'])
    food     = dest_info.get('food',   ['Local Cuisine','Street Food','Restaurant Dinner'])
    tips     = dest_info.get('tips',   ['Carry water','Wear comfortable shoes','Keep emergency contacts handy'])
    safety   = dest_info.get('safety', 'Stay alert and keep emergency contacts handy.')
    bud_info = dest_info.get('budget', {}).get(budget, '₹2000–4000/day')

    # build preference activities
    pref_acts = []
    for p in (preferences or []):
        pref_acts.extend(PREF_ACTIVITIES.get(p.lower(), []))
    if not pref_acts:
        pref_acts = PREF_ACTIVITIES['cultural'] + PREF_ACTIVITIES['nature']

    itinerary = []
    for day in range(1, days + 1):
        place1 = places[(day * 2 - 2) % len(places)]
        place2 = places[(day * 2 - 1) % len(places)]
        act    = pref_acts[(day - 1) % len(pref_acts)]
        meal   = food[(day - 1) % len(food)]
        activities = [
            f"Morning: Visit {place1} — explore and take photos",
            f"Afternoon: {act} experience",
            f"Evening: Visit {place2}",
            f"Dinner: Try {meal} at a local restaurant",
            f"Tip: {tips[(day-1) % len(tips)]}"
        ]
        itinerary.append({'day': day, 'activities': activities})

    return {
        'destination': destination.title(),
        'days':        days,
        'budget_est':  bud_info,
        'safety_note': safety,
        'itinerary':   itinerary,
        'top_places':  places[:5],
        'must_try':    food[:3],
        'lat':         dest_info.get('lat'),
        'lng':         dest_info.get('lng')
    }

@app.route('/plan-trip', methods=['POST'])
@token_required
def plan_trip():
    data        = request.get_json()
    destination = (data.get('destination') or '').strip()
    start_date  = data.get('start_date', '')
    end_date    = data.get('end_date', '')
    budget      = data.get('budget', 'mid').lower()
    preferences = data.get('preferences', [])

    if not destination:
        return jsonify({'error': 'Destination is required'}), 400

    # calculate days
    try:
        d1   = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        d2   = datetime.datetime.strptime(end_date,   '%Y-%m-%d')
        days = max(1, (d2 - d1).days + 1)
    except Exception:
        days = 3

    plan = generate_itinerary(destination, days, preferences, budget)

    # save trip to DB
    conn = get_db()
    try:
        cur = conn.execute(
            'INSERT INTO trips (user_id,destination,start_date,end_date,budget,preferences) VALUES (?,?,?,?,?,?)',
            (request.user['id'], destination, start_date, end_date, budget, ','.join(preferences))
        )
        trip_id = cur.lastrowid
        for day_plan in plan['itinerary']:
            for act in day_plan['activities']:
                conn.execute('INSERT INTO itinerary (trip_id,day_number,activity) VALUES (?,?,?)',
                             (trip_id, day_plan['day'], act))
        conn.commit()
        plan['trip_id'] = trip_id
    finally:
        conn.close()

    return jsonify(plan), 201

@app.route('/trips', methods=['GET'])
@token_required
def get_trips():
    conn = get_db()
    try:
        trips = conn.execute(
            'SELECT * FROM trips WHERE user_id=? ORDER BY created_at DESC',
            (request.user['id'],)
        ).fetchall()
        result = []
        for t in trips:
            t = dict(t)
            rows = conn.execute(
                'SELECT * FROM itinerary WHERE trip_id=? ORDER BY day_number,id',
                (t['id'],)
            ).fetchall()
            days = {}
            for r in rows:
                d = r['day_number']
                days.setdefault(d, []).append(r['activity'])
            t['itinerary'] = [{'day': d, 'activities': acts} for d, acts in sorted(days.items())]
            result.append(t)
        return jsonify(result)
    finally:
        conn.close()

@app.route('/trips/<int:trip_id>', methods=['DELETE'])
@token_required
def delete_trip(trip_id):
    conn = get_db()
    try:
        conn.execute('DELETE FROM itinerary WHERE trip_id=?', (trip_id,))
        conn.execute('DELETE FROM trips WHERE id=? AND user_id=?', (trip_id, request.user['id']))
        conn.commit()
        return jsonify({'message': 'Trip deleted'})
    finally:
        conn.close()

# ── AI Chatbot ────────────────────────────────────────────────────────────────

CHATBOT_KB = {
    # destinations
    'goa':      lambda: f"🏖️ <b>Goa</b> — Top picks: {', '.join(DEST_DB['goa']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['goa']['food'][:3])}.<br>Safety: {DEST_DB['goa']['safety']}",
    'delhi':    lambda: f"🏛️ <b>Delhi</b> — Top picks: {', '.join(DEST_DB['delhi']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['delhi']['food'][:3])}.<br>Safety: {DEST_DB['delhi']['safety']}",
    'mumbai':   lambda: f"🌆 <b>Mumbai</b> — Top picks: {', '.join(DEST_DB['mumbai']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['mumbai']['food'][:3])}.<br>Safety: {DEST_DB['mumbai']['safety']}",
    'jaipur':   lambda: f"🏰 <b>Jaipur</b> — Top picks: {', '.join(DEST_DB['jaipur']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['jaipur']['food'][:3])}.<br>Safety: {DEST_DB['jaipur']['safety']}",
    'kerala':   lambda: f"🌴 <b>Kerala</b> — Top picks: {', '.join(DEST_DB['kerala']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['kerala']['food'][:3])}.<br>Safety: {DEST_DB['kerala']['safety']}",
    'agra':     lambda: f"🕌 <b>Agra</b> — Top picks: {', '.join(DEST_DB['agra']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['agra']['food'][:3])}.<br>Safety: {DEST_DB['agra']['safety']}",
    'manali':   lambda: f"🏔️ <b>Manali</b> — Top picks: {', '.join(DEST_DB['manali']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['manali']['food'][:3])}.<br>Safety: {DEST_DB['manali']['safety']}",
    'varanasi': lambda: f"🛕 <b>Varanasi</b> — Top picks: {', '.join(DEST_DB['varanasi']['places'][:4])}.<br>Must try: {', '.join(DEST_DB['varanasi']['food'][:3])}.<br>Safety: {DEST_DB['varanasi']['safety']}",
}

def chatbot_response(message, user_id=None):
    msg = message.lower().strip()

    # destination queries
    for dest, fn in CHATBOT_KB.items():
        if dest in msg:
            return fn()

    # safety queries
    if any(w in msg for w in ['safe','danger','risk','unsafe','crime','threat']):
        return ("🛡️ <b>Safety Assessment</b><br>"
                "• Enable location tracking so admin can monitor you<br>"
                "• Add emergency contacts for instant SOS notification<br>"
                "• Press the SOS button if you feel threatened<br>"
                "• Avoid isolated areas after dark<br>"
                "• Emergency: Police <b>100</b> | Ambulance <b>108</b> | Tourist Helpline <b>1363</b>")

    # hospital/medical
    if any(w in msg for w in ['hospital','doctor','medical','ambulance','sick','injured','health']):
        return ("🏥 <b>Medical Emergency</b><br>"
                "• Call Ambulance: <b>108</b> (free, 24/7)<br>"
                "• Press SOS button to alert admin with your location<br>"
                "• Your emergency contacts will be notified automatically<br>"
                "• Stay calm and describe your location clearly to the operator")

    # police
    if any(w in msg for w in ['police','theft','stolen','robbery','crime','lost','missing']):
        return ("👮 <b>Police Assistance</b><br>"
                "• Call Police: <b>100</b><br>"
                "• Tourist Police Helpline: <b>1363</b><br>"
                "• Press SOS button to alert admin immediately<br>"
                "• Note: Keep a copy of your ID and passport at all times")

    # budget
    if any(w in msg for w in ['budget','cost','cheap','expensive','money','price','spend']):
        tips = [f"<b>{d.title()}</b>: {info['budget']['mid']}" for d, info in list(DEST_DB.items())[:5]]
        return "💰 <b>Budget Guide (mid-range)</b><br>" + "<br>".join(tips) + "<br><br>Use the <b>Trip Planner</b> for a detailed cost estimate!"

    # best places
    if any(w in msg for w in ['best place','top place','recommend','suggest','where to go','visit','destination']):
        return ("🗺️ <b>Top Destinations in India</b><br>"
                "🏖️ <b>Goa</b> — beaches & nightlife<br>"
                "🏛️ <b>Delhi</b> — history & culture<br>"
                "🏰 <b>Jaipur</b> — royal heritage<br>"
                "🌴 <b>Kerala</b> — backwaters & nature<br>"
                "🕌 <b>Agra</b> — Taj Mahal<br>"
                "🏔️ <b>Manali</b> — mountains & adventure<br><br>"
                "Use the <b>🗺️ Trip Planner</b> to plan your visit!")

    # weather
    if any(w in msg for w in ['weather','rain','season','climate','monsoon','winter','summer']):
        return ("🌤️ <b>Best Travel Seasons</b><br>"
                "• <b>Oct–Mar</b>: Best for most of India (cool & dry)<br>"
                "• <b>Apr–Jun</b>: Hot but good for hill stations<br>"
                "• <b>Jul–Sep</b>: Monsoon — lush but avoid coastal areas<br><br>"
                "Check the <b>🌤️ Weather Alerts</b> section for real-time conditions!")

    # plan trip
    if any(w in msg for w in ['plan','trip','itinerary','schedule','tour','travel']):
        return ("🗺️ <b>Plan Your Trip</b><br>"
                "Go to the <b>🗺️ Trip Planner</b> section in the sidebar!<br><br>"
                "You can:<br>"
                "• Enter your destination & dates<br>"
                "• Set your budget & preferences<br>"
                "• Get a day-wise itinerary instantly<br>"
                "• Save and manage multiple trips")

    # greetings
    if any(w in msg for w in ['hi','hello','hey','hii','good morning','good evening','namaste']):
        return ("👋 <b>Namaste! I'm TourBot</b> 🗺️<br><br>"
                "I can help you with:<br>"
                "• 🗺️ Trip planning & itineraries<br>"
                "• 📍 Best places to visit<br>"
                "• 💰 Budget estimates<br>"
                "• 🛡️ Safety information<br>"
                "• 🏥 Emergency guidance<br><br>"
                "Ask me anything about your trip!")

    # default
    return ("🤔 I can help with:<br>"
            "<b>Destinations:</b> Goa, Delhi, Mumbai, Jaipur, Kerala, Agra, Manali, Varanasi<br>"
            "<b>Topics:</b> safety, budget, weather, hospitals, police, trip planning<br><br>"
            "Try: <i>\"Best places in Goa\"</i> or <i>\"Is Jaipur safe?\"</i>")

@app.route('/chatbot', methods=['POST'])
@token_required
def chatbot():
    data    = request.get_json()
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Message required'}), 400
    reply = chatbot_response(message, request.user['id'])
    return jsonify({'reply': reply})

if __name__ == '__main__':
    init_db()
    print("✅ Database ready")
    print("🚀 Open http://localhost:5000 in your browser")
    PORT = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=PORT)
    app.run(debug=True, port=5000)
