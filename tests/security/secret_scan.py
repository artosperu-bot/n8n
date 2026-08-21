#!/usr/bin/env python3
"""Fail-closed lightweight secret scan for repository content.

It reports file, line and category only. It never prints the matched secret.
Placeholders such as __SECRET_SQL_BRIDGE__ are allowed.
"""
from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
SKIP_DIRS = {'.git', '.venv', 'venv', 'node_modules', '__pycache__'}
ALLOW_MARKERS = ('__SECRET_', '__REDACTED__', '<REDACTED>', 'EXAMPLE_ONLY')
PATTERNS = [
    # Avoid the documentation phrase "bearer service-role key" while retaining
    # detection for actual bearer credential values.
    ('bearer_token', re.compile(r'(?i)\bBearer\s+(?!service-role\b)[A-Za-z0-9._~+/=-]{12,}')),
    ('authorization_value', re.compile(r'(?i)["\']?Authorization["\']?\s*[:=]\s*["\'][^"\']{12,}["\']')),
    ('openai_key', re.compile(r'\bsk-[A-Za-z0-9_-]{16,}\b')),
    ('supabase_service_role', re.compile(r'(?i)\bservice[_-]?role\b.{0,30}\beyJ[A-Za-z0-9_-]{20,}')),
    ('jwt_like', re.compile(r'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b')),
    ('api_key_assignment', re.compile(r'(?i)\b(?:api[_-]?key|apikey|password|passwd|secret|token)\b\s*[:=]\s*["\'][^"\']{12,}["\']')),
    ('private_key', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')),
]

findings = []
for path in ROOT.rglob('*'):
    if not path.is_file() or any(part in SKIP_DIRS for part in path.parts):
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    for line_no, line in enumerate(text.splitlines(), 1):
        if any(marker in line for marker in ALLOW_MARKERS):
            continue
        if path.name == 'secret_scan.py':
            continue
        for category, rx in PATTERNS:
            if rx.search(line):
                findings.append((path.relative_to(ROOT), line_no, category))

if findings:
    print('SECRET_SCAN=FAIL')
    for path, line_no, category in findings:
        print(f'{path}:{line_no}: secret detected [{category}]')
    sys.exit(2)

print('SECRET_SCAN=PASS')
print('findings=0')
