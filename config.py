"""
Configuration loader for API keys.
Loads secrets from secrets.toml (or secrets.toml.toml) file, falling back to environment variables.
"""
import os
import re

# Look for secrets file in project directory
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# Try both naming conventions
SECRETS_PATHS = [
    os.path.join(PROJECT_ROOT, 'secrets.toml'),
    os.path.join(PROJECT_ROOT, 'secrets.toml.toml'),
]

# Whitelist of keys to load from secrets file
ALLOWED_KEYS = (
    'POLYGON_API_KEY',
    'FMP_API_KEY',
    'GEMINI_API_KEY',
    'FRED_API_KEY',
    'EIA_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'FINNHUB_API_KEY',
    'ALPHA_VANTAGE_API_KEY',
    'NEWS_API_KEY',
    'XAI_API_KEY',
)

def _load_secrets_from_file():
    """Load secrets from TOML-like file."""
    secrets = {}

    for secrets_path in SECRETS_PATHS:
        if os.path.exists(secrets_path):
            with open(secrets_path, 'r', encoding='utf-8') as f:
                for line in f:
                    # Skip comments
                    if line.strip().startswith('#'):
                        continue
                    # Match KEY = "value" pattern
                    match = re.match(r'\s*([A-Z0-9_]+)\s*=\s*"(.*)"', line)
                    if match:
                        key, val = match.group(1), match.group(2)
                        if key in ALLOWED_KEYS:
                            secrets[key] = val
            break  # Stop after finding first valid file

    return secrets

# Load secrets once at module import
_secrets = _load_secrets_from_file()

def get_api_key(key_name):
    """
    Get an API key by name.
    Priority: secrets file > environment variable
    """
    # First check secrets file
    if key_name in _secrets:
        return _secrets[key_name]
    # Fall back to environment variable
    return os.getenv(key_name)

# Export commonly used keys for convenience
POLYGON_API_KEY = get_api_key('POLYGON_API_KEY')
FRED_API_KEY = get_api_key('FRED_API_KEY')
EIA_API_KEY = get_api_key('EIA_API_KEY')
FMP_API_KEY = get_api_key('FMP_API_KEY')
GEMINI_API_KEY = get_api_key('GEMINI_API_KEY')
FINNHUB_API_KEY = get_api_key('FINNHUB_API_KEY')
ALPHA_VANTAGE_API_KEY = get_api_key('ALPHA_VANTAGE_API_KEY')
OPENAI_API_KEY = get_api_key('OPENAI_API_KEY')
ANTHROPIC_API_KEY = get_api_key('ANTHROPIC_API_KEY')
NEWS_API_KEY = get_api_key('NEWS_API_KEY')
XAI_API_KEY = get_api_key('XAI_API_KEY')
