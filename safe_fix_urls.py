#!/usr/bin/env python3
"""
Safer script to replace hardcoded URLs without breaking syntax
"""
import os
import re

def safe_url_replacement():
    base_dir = "frontend/src"
    
    # Find all JS files with hardcoded URLs
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    original_content = content
                    
                    # Only replace if it contains hardcoded URLs
                    if 'http://127.0.0.1:8000' in content:
                        # Calculate correct relative path for API import
                        depth = len([p for p in file_path.split('/') if p and p != 'frontend' and p != 'src']) - 1
                        correct_path = '../' * depth + 'config/api'
                        if depth == 0:
                            correct_path = './config/api'
                        
                        # Add import if not already present
                        if 'API_BASE_URL' not in content and 'config/api' not in content:
                            # Find first import line and add after it
                            lines = content.split('\n')
                            for i, line in enumerate(lines):
                                if line.strip().startswith('import '):
                                    lines.insert(i + 1, f'import {{ API_BASE_URL }} from "{correct_path}";')
                                    break
                            content = '\n'.join(lines)
                        
                        # Safe replacement: only replace when clearly part of a URL string
                        # Replace in single quotes
                        content = re.sub(r"'http://127\.0\.0\.1:8000([^']*)'", r"'${API_BASE_URL}\1'", content)
                        # Replace in double quotes  
                        content = re.sub(r'"http://127\.0\.0\.1:8000([^"]*)"', r'"${API_BASE_URL}\1"', content)
                        # Replace in template literals (already using backticks)
                        content = re.sub(r'`http://127\.0\.0\.1:8000([^`]*)`', r'`${API_BASE_URL}\1`', content)
                        
                        # Then convert quotes to template literals where API_BASE_URL is used
                        content = re.sub(r'"([^"]*\$\{API_BASE_URL\}[^"]*)"', r'`\1`', content)
                        content = re.sub(r"'([^']*\$\{API_BASE_URL\}[^']*)'", r'`\1`', content)
                    
                    # Write only if content changed
                    if content != original_content:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                        print(f"Fixed: {file_path}")
                
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

if __name__ == "__main__":
    safe_url_replacement()
    print("Done!")
