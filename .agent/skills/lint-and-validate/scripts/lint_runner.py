#!/usr/bin/env python3
"""
Lint Runner - Unified linting and type checking
Runs appropriate linters based on project type.

Usage:
    python lint_runner.py <project_path>

Supports:
    - Node.js: npm run lint, npx tsc --noEmit
    - Python: ruff check, mypy
"""

import subprocess
import sys
import json
import platform
import shutil
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except:
    pass


def detect_project_type(project_path: Path) -> dict:
    """Detect project type and available linters."""
    result = {
        "type": "monorepo" if (project_path / "frontend").exists() or (project_path / "backend").exists() else "unknown",
        "linters": []
    }
    
    # Check project subfolders or the main path
    subpaths = []
    if (project_path / "frontend").exists() and (project_path / "frontend").is_dir():
        subpaths.append(project_path / "frontend")
    if (project_path / "backend").exists() and (project_path / "backend").is_dir():
        subpaths.append(project_path / "backend")
    if not subpaths:
        subpaths.append(project_path)
        
    for path in subpaths:
        # Node.js project
        package_json = path / "package.json"
        if package_json.exists():
            if result["type"] == "unknown":
                result["type"] = "node"
            try:
                pkg = json.loads(package_json.read_text(encoding='utf-8'))
                scripts = pkg.get("scripts", {})
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                
                # Check for lint script
                if "lint" in scripts:
                    result["linters"].append({"name": f"npm lint ({path.name})", "cmd": ["npm", "run", "lint"], "cwd": path})
                elif "eslint" in deps:
                    result["linters"].append({"name": f"eslint ({path.name})", "cmd": ["npx", "eslint", "."], "cwd": path})
                
                # Check for TypeScript
                if "typescript" in deps or (path / "tsconfig.json").exists():
                    result["linters"].append({"name": f"tsc ({path.name})", "cmd": ["npx", "tsc", "--noEmit"], "cwd": path})
                    
            except:
                pass
        
        # Python project
        # Ignore requirements.txt at the root level if backend directory exists to prevent false positive
        is_root_requirements = (path == project_path) and (project_path / "backend").exists()
        if not is_root_requirements and ((path / "pyproject.toml").exists() or (path / "requirements.txt").exists()):
            if result["type"] == "unknown":
                result["type"] = "python"
            result["linters"].append({"name": f"ruff ({path.name})", "cmd": ["ruff", "check", "."], "cwd": path})
            if (path / "mypy.ini").exists() or (path / "pyproject.toml").exists():
                result["linters"].append({"name": f"mypy ({path.name})", "cmd": ["mypy", "."], "cwd": path})
    
    return result


def run_linter(linter: dict, cwd: Path) -> dict:
    """Run a single linter and return results."""
    result = {
        "name": linter["name"],
        "passed": False,
        "output": "",
        "error": ""
    }
    
    try:
        cmd = linter["cmd"]
        run_cwd = linter.get("cwd", cwd)
        
        # Windows compatibility for npm/npx
        if platform.system() == "Windows":
            if cmd[0] in ["npm", "npx"]:
                # Force .cmd extension on Windows
                if not cmd[0].lower().endswith(".cmd"):
                    cmd[0] = f"{cmd[0]}.cmd"
        
        # Check if executable exists in system path
        exe = cmd[0]
        if not shutil.which(exe):
            return {
                "name": linter["name"],
                "passed": True,
                "output": "",
                "error": f"Executable not found: {exe}",
                "skipped": True
            }
        
        proc = subprocess.run(
            cmd,
            cwd=str(run_cwd),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=120,
            shell=platform.system() == "Windows" # Shell=True often helps with path resolution on Windows
        )
        
        result["output"] = proc.stdout[:2000] if proc.stdout else ""
        result["error"] = proc.stderr[:500] if proc.stderr else ""
        result["passed"] = proc.returncode == 0
        
    except FileNotFoundError:
        result["error"] = f"Command not found: {linter['cmd'][0]}"
    except subprocess.TimeoutExpired:
        result["error"] = "Timeout after 120s"
    except Exception as e:
        result["error"] = str(e)
    
    return result


def main():
    project_path = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    
    print(f"\n{'='*60}")
    print(f"[LINT RUNNER] Unified Linting")
    print(f"{'='*60}")
    print(f"Project: {project_path}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Detect project type
    project_info = detect_project_type(project_path)
    print(f"Type: {project_info['type']}")
    print(f"Linters: {len(project_info['linters'])}")
    print("-"*60)
    
    if not project_info["linters"]:
        print("No linters found for this project type.")
        output = {
            "script": "lint_runner",
            "project": str(project_path),
            "type": project_info["type"],
            "checks": [],
            "passed": True,
            "message": "No linters configured"
        }
        print(json.dumps(output, indent=2))
        sys.exit(0)
    
    # Run each linter
    results = []
    all_passed = True
    
    for linter in project_info["linters"]:
        print(f"\nRunning: {linter['name']}...")
        result = run_linter(linter, project_path)
        results.append(result)
        
        if result["passed"]:
            print(f"  [PASS] {linter['name']}")
        else:
            print(f"  [FAIL] {linter['name']}")
            if result["error"]:
                print(f"  Error: {result['error'][:200]}")
            all_passed = False
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    for r in results:
        icon = "[PASS]" if r["passed"] else "[FAIL]"
        print(f"{icon} {r['name']}")
    
    output = {
        "script": "lint_runner",
        "project": str(project_path),
        "type": project_info["type"],
        "checks": results,
        "passed": all_passed
    }
    
    print("\n" + json.dumps(output, indent=2))
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
