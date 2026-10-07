#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build this dependency-free extension offline using the VSIX schema used by vsce.

Reference: https://github.com/microsoft/vscode-vsce/blob/main/src/package.ts
This is intentionally scoped to this extension, not a general replacement for vsce.
"""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent


def build():
    package = json.loads((ROOT / 'package.json').read_text())
    esc = lambda text: escape(text, {'"': '&quot;'})
    manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata>
<Identity Language="en-US" Id="{esc(package['name'])}" Version="{esc(package['version'])}" Publisher="{esc(package['publisher'])}" />
<DisplayName>{esc(package['displayName'])}</DisplayName>
<Description xml:space="preserve">{esc(package['description'])}</Description>
<Tags>undo,history,emacs,undo-tree</Tags><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="{esc(package['engines']['vscode'])}" /><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" /></Properties>
<License>extension/LICENSE</License>
</Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation><Dependencies />
<Assets>
<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
<Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />
</Assets></PackageManifest>'''
    content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="json" ContentType="application/json" /><Default Extension="js" ContentType="application/javascript" />
<Default Extension="css" ContentType="text/css" /><Default Extension="md" ContentType="text/markdown" />
<Default Extension="el" ContentType="text/plain" /><Default Extension="py" ContentType="text/plain" />
<Default Extension="vsixmanifest" ContentType="text/xml" />
<Override PartName="/extension/LICENSE" ContentType="text/plain" /><Override PartName="/extension/LICENSE-MIT" ContentType="text/plain" />
<Override PartName="/extension/NOTICE" ContentType="text/plain" /></Types>'''
    files = [ROOT / name for name in ['package.json', 'README.md', 'README.ja.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'LICENSE', 'LICENSE-MIT', 'NOTICE']]
    # Include the complete source, reference source, tests, and reproduction tools.
    for directory in ['src', 'media', 'docs', 'upstream', 'scripts', 'test']:
        files.extend(file for file in (ROOT / directory).rglob('*') if file.is_file() and '__pycache__' not in file.parts)
    output = ROOT / f"{package['name']}-{package['version']}.vsix"
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('extension.vsixmanifest', manifest)
        archive.writestr('[Content_Types].xml', content_types)
        for file in sorted(files):
            archive.write(file, 'extension/' + file.relative_to(ROOT).as_posix())
    with ZipFile(output) as archive:
        assert archive.testzip() is None
        ET.fromstring(archive.read('extension.vsixmanifest'))
        ET.fromstring(archive.read('[Content_Types].xml'))
        assert json.loads(archive.read('extension/package.json')) == package
        assert 'extension/' + package['main'].removeprefix('./') in archive.namelist()
    print(f'{output} ({output.stat().st_size:,} bytes, {len(files)} source files)')
    return output


if __name__ == '__main__':
    build()
