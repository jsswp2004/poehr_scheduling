# 🧪 POWER IT Healthcare - Test Suite

## 🐳 **Docker Environment Setup**

This project runs in Docker. For frontend React tests:

- **In Docker**: Node.js not available in main container
- **Recommended**: Run frontend tests locally on Windows
- **Alternative**: Use separate Node.js container (see TESTING_SETUP_COMPLETE.md)

### **Quick Start for Docker:**

```bash
# Backend tests (in Docker container)
python manage.py test
python -m pytest tests/

# Frontend tests (exit Docker, run locally)
exit
cd frontend && npm test
```

- **Run with**: `python -m pytest tests/api/`
- **Examples**: User API, organization API, enrollment API

### `/websocket/` - WebSocket Tests

- **Purpose**: Test real-time communication features
- **Run with**: `python -m pytest tests/websocket/`
- **Examples**: Chat functionality, online status, presence

### `/manual/` - Manual Test Procedures

- **Purpose**: HTML test pages and manual testing procedures
- **Run with**: Open HTML files in browser, follow test procedures
- **Examples**: UI testing, visual verification, user acceptance tests

## 🚀 Quick Start

### Run All Tests

```bash
# Backend tests
python manage.py test
python -m pytest tests/

# Frontend tests
cd frontend && npm test
```

### Run Specific Test Categories

```bash
# Unit tests only
python -m pytest tests/unit/

# Integration tests only
python -m pytest tests/integration/

# API tests only
python -m pytest tests/api/

# WebSocket tests only
python -m pytest tests/websocket/
```

## 📋 Test Status

### ✅ Working Tests

- Badge system integration tests
- SMS verification flow
- WebSocket connection tests
- Manual UI test procedures

### 🔧 Needs Review/Update

- Some unit tests may need modernization
- API tests may need authentication updates
- WebSocket tests may need endpoint updates

### 🗑️ Cleaned Up

- ✅ Removed 16 empty test files
- ✅ Organized 100+ test files into categories
- ✅ Moved debug scripts to `/scripts/debug/`
- ✅ Moved setup scripts to `/scripts/setup/`
