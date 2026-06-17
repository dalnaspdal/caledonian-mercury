#!/bin/bash
# Launch script for Caledonian Mercury

# Add backend to PYTHONPATH
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend

source venv/bin/activate

# 1. Scrape latest stories
echo "Updating news feeds..."
python3 backend/scraper.py

# 2. Launch Curation Cockpit
echo "Launching Curation Cockpit..."
python3 backend/gui.py
