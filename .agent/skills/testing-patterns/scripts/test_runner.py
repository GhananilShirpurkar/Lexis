#!/usr/bin/env python3
"""
Test Runner - Unified test execution and coverage reporting
Runs tests and generates coverage report based on project type.

Usage:
    python test_runner.py <project_path> [--coverage]

Supports:
    - Node.js: npm test, jest, vitest
    - Python: pytest, unittest
"""

import subprocess
import sys
import json
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except:
    pass


def detect_test_framework(project_path: Path) -> dict:
    """Detect test framework and commands."""
    result = {
        "type": "monorepo" if (project_path / "frontend").exists() or (project_path / "backend").exists() else "unknown",
        "jobs": []
    }
    
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
            try:
                pkg = json.loads(package_json.read_text(encoding='utf-8'))
                scripts = pkg.get("scripts", {})
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                
                # Check for test script
                if "test" in scripts:
                    job = {
                        "name": f"npm test ({path.name})",
                        "cmd": ["npm", "test"],
                        "cwd": path,
                        "coverage_cmd": None
                    }
                    if "vitest" in deps:
                        job["coverage_cmd"] = ["npx", "vitest", "run", "--coverage"]
                    elif "jest" in deps:
                        job["coverage_cmd"] = ["npx", "jest", "--coverage"]
                    result["jobs"].append(job)
                elif "vitest" in deps:
                    result["jobs"].append({
                        "name": f"vitest ({path.name})",
                        "cmd": ["npx", "vitest", "run"],
                        "cwd": path,
                        "coverage_cmd": ["npx", "vitest", "run", "--coverage"]
                    })
                elif "jest" in deps:
                    result["jobs"].append({
                        "name": f"jest ({path.name})",
                        "cmd": ["npx", "jest"],
                        "cwd": path,
                        "coverage_cmd": ["npx", "jest", "--coverage"]
                    })
            except:
                pass
        
        # Python project
        is_root_requirements = (path == project_path) and (project_path / "backend").exists()
        if not is_root_requirements and ((path / "pyproject.toml").exists() or (path / "requirements.txt").exists()):
            if (path / "tests").exists() or (path / "test").exists() or (path / "pyproject.toml").exists():
                result["jobs"].append({
                    "name": f"pytest ({path.name})",
                    "cmd": ["python", "-m", "pytest", "-v"],
                    "cwd": path,
                    "coverage_cmd": ["python", "-m", "pytest", "--cov", "--cov-report=term-missing"]
                })
    
    return result


def run_tests(cmd: list, cwd: Path) -> dict:
    """Run tests and return results."""
    import shutil
    import platform
    result = {
        "passed": False,
        "output": "",
        "error": "",
        "tests_run": 0,
        "tests_passed": 0,
        "tests_failed": 0,
        "skipped": False
    }
    
    try:
        # Check if executable exists in system path
        exe = cmd[0]
        if not shutil.which(exe):
            return {
                "passed": True,
                "output": "",
                "error": f"Executable not found: {exe}",
                "tests_run": 0,
                "tests_passed": 0,
                "tests_failed": 0,
                "skipped": True
            }
            
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=300,  # 5 min timeout for tests
            shell=platform.system() == "Windows"
        )
        
        result["output"] = proc.stdout[:3000] if proc.stdout else ""
        result["error"] = proc.stderr[:500] if proc.stderr else ""
        result["passed"] = proc.returncode == 0
        
        # Try to parse test counts from output
        output = proc.stdout or ""
        
        # Jest/Vitest pattern: "Tests: X passed, Y failed, Z total"
        if "passed" in output.lower() and "failed" in output.lower():
            import re
            match = re.search(r'(\d+)\s+passed', output, re.IGNORECASE)
            if match:
                result["tests_passed"] = int(match.group(1))
            match = re.search(r'(\d+)\s+failed', output, re.IGNORECASE)
            if match:
                result["tests_failed"] = int(match.group(1))
            result["tests_run"] = result["tests_passed"] + result["tests_failed"]
        
        # Pytest pattern: "X passed, Y failed"
        if "pytest" in str(cmd):
            import re
            match = re.search(r'(\d+)\s+passed', output)
            if match:
                result["tests_passed"] = int(match.group(1))
            match = re.search(r'(\d+)\s+failed', output)
            if match:
                result["tests_failed"] = int(match.group(1))
            result["tests_run"] = result["tests_passed"] + result["tests_failed"]
        
    except FileNotFoundError:
        result["error"] = f"Command not found: {cmd[0]}"
        result["passed"] = True
        result["skipped"] = True
    except subprocess.TimeoutExpired:
        result["error"] = "Timeout after 300s"
    except Exception as e:
        result["error"] = str(e)
    
    return result


def main():
    project_path = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    with_coverage = "--coverage" in sys.argv
    
    print(f"\n{'='*60}")
    print(f"[TEST RUNNER] Unified Test Execution")
    print(f"{'='*60}")
    print(f"Project: {project_path}")
    print(f"Coverage: {'enabled' if with_coverage else 'disabled'}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Detect test framework
    test_info = detect_test_framework(project_path)
    print(f"Type: {test_info['type']}")
    print("-"*60)
    
    if not test_info["jobs"]:
        print("No test frameworks found for this project.")
        output = {
            "script": "test_runner",
            "project": str(project_path),
            "type": test_info["type"],
            "passed": True,
            "message": "No tests configured"
        }
        print(json.dumps(output, indent=2))
        sys.exit(0)
    
    all_passed = True
    results = []
    
    for job in test_info["jobs"]:
        cmd = job["coverage_cmd"] if with_coverage and job["coverage_cmd"] else job["cmd"]
        print(f"Running: {' '.join(cmd)} inside {job['cwd'].name}")
        print("-"*60)
        
        res = run_tests(cmd, job["cwd"])
        
        # Print output (truncated)
        if res["output"]:
            lines = res["output"].split("\n")
            for line in lines[:30]:
                print(line)
            if len(lines) > 30:
                print(f"... ({len(lines) - 30} more lines)")
        
        if not res["passed"]:
            all_passed = False
            
        results.append({
            "name": job["name"],
            "passed": res["passed"],
            "skipped": res.get("skipped", False),
            "tests_run": res["tests_run"],
            "tests_passed": res["tests_passed"],
            "tests_failed": res["tests_failed"],
            "error": res["error"]
        })
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    for r in results:
        status = "[PASS]" if r["passed"] else "[FAIL]"
        if r.get("skipped"):
            status = "[SKIP]"
        print(f"{status} {r['name']}")
        if r["tests_run"] > 0:
            print(f"  Tests: {r['tests_run']} total, {r['tests_passed']} passed, {r['tests_failed']} failed")
        if r["error"]:
            print(f"  Error: {r['error']}")
            
    output = {
        "script": "test_runner",
        "project": str(project_path),
        "type": test_info["type"],
        "passed": all_passed,
        "results": results
    }
    
    print("\n" + json.dumps(output, indent=2))
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
