#!/usr/bin/env python3
"""Create PWA raster icons from the existing official ASYLUM logo."""
from pathlib import Path
from PIL import Image, ImageOps
SOURCE=Path('public/resources/asylum-community-logo.jpg')
OUT=Path('public/icons')
OUT.mkdir(parents=True,exist_ok=True)
with Image.open(SOURCE) as source:
    source=source.convert('RGB')
    for name,size,padding in [('icon-192.png',192,0),('icon-512.png',512,0),('icon-maskable-512.png',512,76),('apple-touch-icon.png',180,0)]:
        side=size-padding*2
        fitted=ImageOps.contain(source,(side,side),Image.Resampling.LANCZOS)
        canvas=Image.new('RGB',(size,size),(11,9,10))
        canvas.paste(fitted,((size-fitted.width)//2,(size-fitted.height)//2))
        canvas.save(OUT/name,'PNG',optimize=True)
        print('Generated',OUT/name,canvas.size)
