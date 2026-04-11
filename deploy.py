#!/usr/bin/env python3
"""
Deploy static site to Netlify using their API (no account required for drop sites).
"""
import os
import json
import hashlib
import urllib.request
import urllib.error
import mimetypes
import sys

SITE_DIR = os.path.dirname(os.path.abspath(__file__))

def sha1_file(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def collect_files(directory):
    files = {}
    for root, dirs, filenames in os.walk(directory):
        # Skip deploy script itself and hidden files
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for fname in filenames:
            if fname.startswith('.') or fname == 'deploy.py':
                continue
            full_path = os.path.join(root, fname)
            rel_path = '/' + os.path.relpath(full_path, directory)
            files[rel_path] = {
                'path': full_path,
                'sha1': sha1_file(full_path)
            }
    return files

def deploy():
    print("📦 파일 수집 중...")
    files = collect_files(SITE_DIR)
    
    print(f"  {len(files)}개 파일 발견:")
    for path in sorted(files.keys()):
        print(f"    {path}")
    
    # Step 1: Create site with file manifest
    print("\n🚀 Netlify에 사이트 생성 중...")
    
    file_hashes = {path: info['sha1'] for path, info in files.items()}
    
    payload = json.dumps({
        "files": file_hashes
    }).encode('utf-8')
    
    req = urllib.request.Request(
        'https://api.netlify.com/api/v1/sites',
        data=payload,
        headers={
            'Content-Type': 'application/json',
        },
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            site_data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"❌ 사이트 생성 실패: {e.code} {body}")
        sys.exit(1)
    
    site_id = site_data['id']
    deploy_id = site_data.get('deploy_id') or site_data.get('id')
    site_url = site_data.get('ssl_url') or site_data.get('url', '')
    required = site_data.get('required', list(file_hashes.keys()))
    
    # For new sites, we might get deploy info from a sub-object
    if 'deploy_id' not in site_data:
        # Create a deploy
        print("  배포 생성 중...")
        dep_req = urllib.request.Request(
            f'https://api.netlify.com/api/v1/sites/{site_id}/deploys',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(dep_req) as resp:
                deploy_data = json.loads(resp.read().decode())
                deploy_id = deploy_data['id']
                required = deploy_data.get('required', list(file_hashes.keys()))
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"❌ 배포 생성 실패: {e.code} {body}")
            sys.exit(1)
    
    print(f"  사이트 ID: {site_id}")
    print(f"  배포 ID: {deploy_id}")
    
    # Step 2: Upload required files
    print(f"\n📤 파일 업로드 중... ({len(required)}개)")
    
    uploaded = 0
    for file_path in required:
        if file_path not in files:
            # Try matching by hash
            for fp, info in files.items():
                if info['sha1'] == file_path:
                    file_path = fp
                    break
            else:
                continue
        
        info = files[file_path]
        with open(info['path'], 'rb') as f:
            file_data = f.read()
        
        content_type = mimetypes.guess_type(info['path'])[0] or 'application/octet-stream'
        
        upload_url = f'https://api.netlify.com/api/v1/deploys/{deploy_id}/files{file_path}'
        up_req = urllib.request.Request(
            upload_url,
            data=file_data,
            headers={
                'Content-Type': 'application/octet-stream',
            },
            method='PUT'
        )
        
        try:
            with urllib.request.urlopen(up_req) as resp:
                resp.read()
            uploaded += 1
            print(f"  ✅ {file_path}")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"  ❌ {file_path}: {e.code} {body}")
    
    print(f"\n✨ 배포 완료!")
    print(f"🌐 URL: {site_url}")
    print(f"\n이 URL을 아무 기기에서 열면 Guitar Tab Generator를 사용할 수 있습니다!")

if __name__ == '__main__':
    deploy()
