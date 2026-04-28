# Smart Tourist Safety Monitoring System

## Setup

### 1. Database
```sql
-- Run in MySQL:
source database/schema.sql
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt

# Optional: set env vars (or edit config.py directly)
# DB_USER, DB_PASSWORD, DB_HOST, DB_NAME, SECRET_KEY

python app.py
```
Backend runs at `http://localhost:5000`

### 3. Frontend
Open `frontend/index.html` in a browser (or serve with Live Server).

## Default Admin Login
- Email: `admin@tourist.com`
- Password: `admin123`

## API Endpoints
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /register | None | Register tourist |
| POST | /login | None | Login |
| POST | /location | Tourist | Save GPS location |
| GET | /location/:id | Admin | Get user's last location |
| POST | /alert | Tourist | Send SOS alert |
| GET | /alerts | Admin | All alerts |
| GET | /alerts/my | Tourist | My alerts |
| PUT | /alerts/:id/resolve | Admin | Resolve alert |
| GET | /users | Admin | All tourists |
