#!/usr/bin/env python3
"""
Build script to render Flask templates with correct static paths for static deployment.
This script processes Jinja2 templates and replaces url_for() calls with actual static paths.
"""

import os
import sys
import shutil
from pathlib import Path

def main():
    # Paths
    frontend_dir = Path(__file__).parent
    templates_dir = frontend_dir / 'templates'
    static_dir = frontend_dir / 'static'
    build_dir = frontend_dir / 'build'
    
    # Clean and create build directory
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir()
    
    # Copy static files
    if static_dir.exists():
        shutil.copytree(static_dir, build_dir / 'static')
        print(f"Copied static files to {build_dir / 'static'}")
    
    # Copy config files if they exist
    config_dir = frontend_dir / 'config'
    if config_dir.exists():
        shutil.copytree(config_dir, build_dir / 'config')
        print(f"Copied config files to {build_dir / 'config'}")
    
    # Process templates
    for template_file in templates_dir.glob('*.html'):
        process_template(template_file, build_dir, static_dir)
    
    print(f"Build completed. Files ready for deployment in: {build_dir}")

def process_template(template_path, build_dir, static_dir):
    """Process a single template file and replace url_for calls with static paths."""
    
    with open(template_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace url_for calls with actual static paths
    # Handle CSS files
    content = content.replace(
        "{{ url_for('static', filename='css/pedigree.css') }}", 
        "./static/css/pedigree.css"
    )
    
    # Handle JS files
    js_replacements = [
        ("{{ url_for('static', filename='js/fhh_build_pedigree.js') }}", "./static/js/fhh_build_pedigree.js"),
        ("{{ url_for('static', filename='js/fhh_display_pedigree.js') }}", "./static/js/fhh_display_pedigree.js"),
        ("{{ url_for('static', filename='js/fhh_load.js') }}", "./static/js/fhh_load.js"),
        ("{{ url_for('static', filename='js/fhh_move.js') }}", "./static/js/fhh_move.js"),
    ]
    
    for old, new in js_replacements:
        content = content.replace(old, new)
    
    # Write processed template
    output_path = build_dir / template_path.name
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Processed template: {template_path.name} -> {output_path}")

if __name__ == '__main__':
    main()
