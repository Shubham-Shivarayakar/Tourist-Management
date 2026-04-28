import os

SECRET_KEY = os.getenv('SECRET_KEY', 'tourist-safety-secret-key-2024')

# ── Email (Gmail SMTP) ────────────────────────────────────────────────────────
# 1. Use your Gmail address below
# 2. For GMAIL_PASSWORD use an App Password (not your real password):
#    Go to: myaccount.google.com → Security → 2-Step Verification → App Passwords
#    Generate one for "Mail" and paste it here
GMAIL_USER     = os.getenv('GMAIL_USER',     'shubhamsshivarayakar@gmail.com')
GMAIL_PASSWORD = os.getenv('GMAIL_PASSWORD', 'kpbe jsga lhpl mmpj')  # replace xxxx with your 16-char app password

OTP_EXPIRY_MIN = 10   # OTP valid for 10 minutes
