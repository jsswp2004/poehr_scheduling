#!/usr/bin/env python3
import requests
import json

# Get token
login_url = "http://localhost:8000/api/auth/login/"
response = requests.post(login_url, json={"username":"jsswp2004","password":"krat27Miko!"})
token_data = response.json()
print("Token response:", json.dumps(token_data, indent=2))
