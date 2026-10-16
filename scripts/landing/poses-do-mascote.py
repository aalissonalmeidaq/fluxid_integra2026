# Recortes do mascote da landing page (Spec 011, adaptação ao pitch). Parte do mascote já sem fundo (mascote-recorte.png, recortado do
# original com rembg/isnet-general-use) e gera o recorte do rosto usado na página. A arte não muda: só o enquadramento.
#
#   python -I scripts/landing/poses-do-mascote.py specs/011-landing-page-institucional/assets/mascote-recorte.png specs/011-landing-page-institucional/assets
#
# Depois, `node scripts/landing/otimizar-imagens.mjs` converte as poses em WebP para public/landing/. Requer Pillow.
import sys
from PIL import Image

src, dest = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
# Rosto: só a cabeça, para avatares e balões.
im.crop((200, 0, 840, 640)).save(f"{dest}/mascote-rosto.png", optimize=True)
