"""Prints the three secrets the hosted app needs. Run it yourself and paste the values into the Render dashboard.

    cd backend && .venv/bin/python scripts/make_secrets.py

Nothing is written to disk. Keep the access code somewhere safe: it is what you type, with your number, to sign in.
"""
import secrets

from cryptography.fernet import Fernet

words = "-".join(secrets.choice(["amber", "basil", "cedar", "dosa", "elm", "fig", "ghee", "honey", "iris", "jade", "kiwi", "lime", "mint", "neem", "olive", "pepper"]) for _ in range(3))
print(f"FOODHUNT_JWT_SECRET={secrets.token_urlsafe(48)}")
print(f"FOODHUNT_TOKEN_KEY={Fernet.generate_key().decode()}")
print(f"FOODHUNT_ACCESS_CODE={words}-{secrets.randbelow(900) + 100}")
