"""
Run environment check tests with secrets loaded from config.
This is only for safe local testing. Do NOT commit secrets to the repo.
"""
import os
import sys

# Ensure repo root is in path so tests can import modules
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)

# Import config to load secrets (this will load from secrets.toml or secrets.toml.toml)
import config

# Set environment variables from loaded config for compatibility with check_env
os.environ['POLYGON_API_KEY'] = config.POLYGON_API_KEY or ''
os.environ['FMP_API_KEY'] = config.FMP_API_KEY or ''
os.environ['GEMINI_API_KEY'] = config.GEMINI_API_KEY or ''
os.environ['FRED_API_KEY'] = config.FRED_API_KEY or ''
os.environ['EIA_API_KEY'] = config.EIA_API_KEY or ''
os.environ['OPENAI_API_KEY'] = config.OPENAI_API_KEY or ''
os.environ['ANTHROPIC_API_KEY'] = config.ANTHROPIC_API_KEY or ''

import tests.check_env as t

if __name__ == '__main__':
    t.main()
