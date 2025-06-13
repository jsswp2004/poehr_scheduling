# 🔧 WEBSOCKET TROUBLESHOOTING GUIDE - Phase 1

## 🚨 **Issue Identified:**
The 404 errors you're seeing indicate that Django is running in **WSGI mode** instead of **ASGI mode**, which is required for WebSocket support.

## ✅ **Solution: Start Django with ASGI Support**

### **Step 1: Stop Current Django Server**
Press `Ctrl+C` in your Django terminal to stop the current server.

### **Step 2: Start Django with Daphne (ASGI Server)**
Instead of `python manage.py runserver`, use:

```bash
cd /c/Users/jsswp/POWER/poehr_scheduling
daphne -p 8000 poehr_scheduling_backend.asgi:application
```

### **Step 3: Verify WebSocket Endpoint**
The WebSocket should now be available at:
- `ws://127.0.0.1:8000/ws/presence/`

### **Step 4: Test the Connection**
1. Open your React app (npm start)
2. Go to Patients → Team tab
3. Check browser console for WebSocket connection logs
4. You should see: `✅ Connected to presence WebSocket`

## 🔍 **What Was Wrong:**

1. **Missing ASGI Server**: Regular Django server (`runserver`) doesn't support WebSockets
2. **Need Daphne**: ASGI server that handles both HTTP and WebSocket protocols
3. **JWT Authentication**: Custom middleware for WebSocket JWT authentication

## 📝 **Expected Behavior After Fix:**

✅ **WebSocket connects successfully**
✅ **Online status indicators work**
✅ **Real-time updates across browser tabs**
✅ **No more 404 errors in Django logs**

## 🛠 **Alternative: Use Channels Development Server**

You can also use the Channels development server:

```bash
cd /c/Users/jsswp/POWER/poehr_scheduling
python manage.py runserver --asgi
```

But Daphne is the recommended production-ready ASGI server.

## 🎯 **Testing Checklist:**

- [ ] Stop regular Django server
- [ ] Start with Daphne: `daphne -p 8000 poehr_scheduling_backend.asgi:application`
- [ ] Open React app in browser
- [ ] Go to Team tab
- [ ] See green/gray online indicators
- [ ] Check Django logs (should show WebSocket connections, not 404s)
- [ ] Open multiple browser tabs to test real-time updates

---

**Your errors came from these JWT tokens attempting WebSocket connections:**
- User: "Danielle Bishop" (admin role)
- Multiple retry attempts with exponential backoff
- All receiving 404 because Django wasn't running in ASGI mode

**After switching to Daphne, these should connect successfully!** 🚀
