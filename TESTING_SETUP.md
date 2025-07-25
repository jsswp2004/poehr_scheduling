# Testing Setup Guide

To run tests in a clean environment, follow these steps:

## 1. Set up Python environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

## 2. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## 3. Set required environment variables

Create a `.env.test` file or export these variables in your shell:

```
DJANGO_SECRET_KEY=your-test-secret-key
DB_NAME=poehr_db
DB_USER=jsswp2004
DB_PASSWORD=your-db-password
DB_HOST=localhost
DB_PORT=5432
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
```

## 4. Run migrations (if needed)

```bash
python manage.py migrate --settings=poehr_scheduling_backend.settings
```

## 5. Run tests

```bash
python manage.py test --settings=poehr_scheduling_backend.settings
```

---

- Ensure PostgreSQL is running and accessible with the credentials above.
- For additional dependencies (e.g., Redis, Celery), see the README or docker-compose files.
- If you encounter import errors, double-check that all dependencies are installed and the virtual environment is activated.
