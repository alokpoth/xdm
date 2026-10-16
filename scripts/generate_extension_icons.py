import os
from PIL import Image

def generate_extension_icons():
    os.makedirs('extension/icons', exist_ok=True)
    if os.path.exists('public/icon.png'):
        base = Image.open('public/icon.png')
        for s in [16, 32, 48, 128]:
            resized = base.resize((s, s), Image.Resampling.LANCZOS)
            resized.save(f'extension/icons/icon{s}.png', 'PNG')
        print("Generated extension icons: 16, 32, 48, 128px")

generate_extension_icons()
