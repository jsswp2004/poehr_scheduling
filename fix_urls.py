#!/usr/bin/env python3
"""
Script to fix hardcoded localhost URLs in React frontend files
"""
import os
import re
import glob

def fix_hardcoded_urls():
    # Base directory
    base_dir = "."
    frontend_dir = os.path.join(base_dir, "frontend", "src")
    
    # Pattern to find hardcoded URLs
    url_pattern = r'http://127\.0\.0\.1:8000'
    api_import_pattern = r'import.*API_BASE_URL.*from.*config/api'
    
    # Find all JS files that contain hardcoded URLs
    js_files = []
    for root, dirs, files in os.walk(frontend_dir):
        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if re.search(url_pattern, content):
                            js_files.append(file_path)
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")
    
    print(f"Found {len(js_files)} files with hardcoded URLs:")
    for file_path in js_files:
        print(f"  {file_path}")
    
    # Fix each file
    for file_path in js_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Calculate relative path for import
            rel_path = os.path.relpath(os.path.join("frontend", "src", "config", "api.js"), os.path.dirname(file_path))
            rel_path = rel_path.replace('\\', '/').replace('.js', '')
            if not rel_path.startswith('.'):
                rel_path = './' + rel_path
            
            # Add API import if not present
            if not re.search(api_import_pattern, content):
                # Find the last import line
                import_lines = []
                lines = content.split('\n')
                last_import_idx = -1
                
                for i, line in enumerate(lines):
                    if line.strip().startswith('import '):
                        last_import_idx = i
                
                if last_import_idx >= 0:
                    lines.insert(last_import_idx + 1, f'import {{ API_BASE_URL }} from "{rel_path}";')
                    content = '\n'.join(lines)
            
            # Replace hardcoded URLs
            content = re.sub(url_pattern, '${API_BASE_URL}', content)
            content = re.sub(r'"' + url_pattern + r'"', '"${API_BASE_URL}"', content)
            content = re.sub(r"'" + url_pattern + r"'", "'${API_BASE_URL}'", content)
            
            # Write back to file
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"Fixed: {file_path}")
            
        except Exception as e:
            print(f"Error fixing {file_path}: {e}")

if __name__ == "__main__":
    fix_hardcoded_urls()
    print("Done!")
