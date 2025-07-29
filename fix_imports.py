#!/usr/bin/env python3
"""
Fix import path and template literal issues in React files
"""
import os
import re

def fix_import_issues():
    base_dir = "frontend/src"
    
    # Find all JS files with import issues
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    original_content = content
                    
                    # Fix 1: Remove duplicate API_BASE_URL imports
                    lines = content.split('\n')
                    seen_api_import = False
                    filtered_lines = []
                    
                    for line in lines:
                        if 'import { API_BASE_URL }' in line and 'config/api' in line:
                            if not seen_api_import:
                                # Calculate correct relative path
                                depth = len([p for p in file_path.split('/') if p and p != 'frontend' and p != 'src']) - 1
                                correct_path = '../' * depth + 'config/api'
                                if depth == 0:
                                    correct_path = './config/api'
                                
                                # Create correct import line
                                correct_line = f'import {{ API_BASE_URL }} from "{correct_path}";'
                                filtered_lines.append(correct_line)
                                seen_api_import = True
                        else:
                            filtered_lines.append(line)
                    
                    content = '\n'.join(filtered_lines)
                    
                    # Fix 2: Template literal issues - fix ${API_BASE_URL} in strings
                    content = re.sub(r'"[^"]*\$\{API_BASE_URL\}[^"]*"', lambda m: m.group(0).replace('"', '`'), content)
                    content = re.sub(r"'[^']*\$\{API_BASE_URL\}[^']*'", lambda m: m.group(0).replace("'", '`'), content)
                    
                    # Fix 3: Specific template string issues
                    content = re.sub(r'"\$\{API_BASE_URL\}"', '`${API_BASE_URL}`', content)
                    content = re.sub(r"'\$\{API_BASE_URL\}'", '`${API_BASE_URL}`', content)
                    
                    # Only write if content changed
                    if content != original_content:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                        print(f"Fixed: {file_path}")
                
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

if __name__ == "__main__":
    fix_import_issues()
    print("Done!")
