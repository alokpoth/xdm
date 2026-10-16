import os
from PIL import Image, ImageDraw

def create_icon():
    os.makedirs('build', exist_ok=True)
    os.makedirs('public', exist_ok=True)
    
    size = (256, 256)
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background rounded rect
    # Gradient or solid dark background with emerald border
    bg_color = (11, 15, 23, 255)
    border_color = (16, 185, 129, 255)
    
    draw.rounded_rectangle([8, 8, 247, 247], radius=50, fill=bg_color, outline=border_color, width=4)
    
    # Draw turbo lightning / arrow shape
    # Points for a sleek bolt
    bolt_points = [
        (145, 40),
        (65, 135),
        (120, 135),
        (105, 215),
        (195, 115),
        (140, 115)
    ]
    
    # Inner glow
    draw.polygon(bolt_points, fill=(16, 185, 129, 255))
    
    # Highlight
    highlight_points = [
        (140, 48),
        (78, 130),
        (122, 130),
        (110, 200),
        (180, 120),
        (138, 120)
    ]
    draw.polygon(highlight_points, fill=(52, 211, 153, 255))
    
    # Save PNGs and ICO
    img.save('public/icon.png', 'PNG')
    img.save('build/icon.png', 'PNG')
    
    # Windows ICO format containing multiple resolutions
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save('public/icon.ico', format='ICO', sizes=ico_sizes)
    img.save('build/icon.ico', format='ICO', sizes=ico_sizes)
    print("Successfully generated icon.png and icon.ico (multi-res 16-256px)!")

if __name__ == '__main__':
    create_icon()
