#!/usr/bin/env python3
import sys
import re

def validate_brief(content):
    """
    Validates a handoff brief against the 2026 project standard.
    """
    mandatory_sections = [
        r"FRESH START PROMPT",
        r"Target Logic \(Jest\)",
        r"Target UI \(Playwright\)",
        r"Backend/Supabase Context",
        r"Reproduction"
    ]
    
    missing = []
    for section in mandatory_sections:
        if not re.search(section, content, re.IGNORECASE):
            missing.append(section)
            
    # Check for forbidden code snippets (naive check for code blocks)
    code_blocks = re.findall(r"```[a-z]*\n[\s\S]*?\n```", content)
    if code_blocks:
        return False, "FORBIDDEN: Brief contains code snippets. Replace with logic branch descriptions and file paths."

    if missing:
        return False, f"MISSING MANDATORY SECTIONS: {', '.join(missing)}"
    
    return True, "Brief is VALID according to the 2026 handoff-protocol."

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: validate-brief.py <file_path>")
        sys.exit(1)
        
    try:
        with open(sys.argv[1], 'r') as f:
            content = f.read()
        
        valid, message = validate_brief(content)
        print(message)
        sys.exit(0 if valid else 1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
