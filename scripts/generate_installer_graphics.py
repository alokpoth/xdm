from PIL import Image, ImageDraw, ImageFont
import os

def create_sidebar_bmp(filename, is_uninstall=False):
    width, height = 164, 314
    img = Image.new('RGB', (width, height), color='#070b12')
    draw = ImageDraw.Draw(img)

    # Vertical gradient background
    for y in range(height):
        ratio = y / height
        r = int(7 + ratio * 10)
        g = int(11 + ratio * 18)
        b = int(18 + ratio * 24)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Right edge subtle highlight
    draw.line([(width - 1, 0), (width - 1, height)], fill=(20, 35, 50))

    # Top emerald accent bar
    draw.rectangle([(0, 0), (width, 3)], fill=(16, 185, 129))

    # Glowing decorative circle around icon area
    draw.ellipse([(width//2 - 36, 25), (width//2 + 36, 97)], outline=(16, 185, 129, 60), width=1)
    draw.ellipse([(width//2 - 28, 33), (width//2 + 28, 89)], fill=(16, 185, 129, 30))

    # Draw neon lightning bolt in the center of the circle
    # Center is (82, 61)
    bolt = [
        (85, 38),
        (72, 60),
        (82, 60),
        (78, 84),
        (94, 58),
        (84, 58)
    ]
    draw.polygon(bolt, fill=(16, 185, 129))
    # Inner bright core
    inner_bolt = [
        (84, 42),
        (75, 59),
        (83, 59),
        (80, 77),
        (90, 59),
        (83, 59)
    ]
    draw.polygon(inner_bolt, fill=(200, 255, 235))

    # Typography
    try:
        font_title = ImageFont.truetype("arialbd.ttf", 16)
        font_sub = ImageFont.truetype("arialbd.ttf", 8)
        font_feat = ImageFont.truetype("arial.ttf", 9)
        font_credit = ImageFont.truetype("arialbd.ttf", 8)
    except:
        font_title = ImageFont.load_default()
        font_sub = font_title
        font_feat = font_title
        font_credit = font_title

    # Main brand title
    title_text = "XDM TURBO"
    bbox = draw.textbbox((0, 0), title_text, font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, 108), title_text, fill=(255, 255, 255), font=font_title)

    sub_text = "DOWNLOAD ACCELERATOR" if not is_uninstall else "UNINSTALL WIZARD"
    bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, 128), sub_text, fill=(16, 185, 129), font=font_sub)

    # Separator
    draw.line([(20, 144), (width - 20, 144)], fill=(30, 48, 65))

    # Features
    features = [
        "⚡ 32-Stream Turbo Engine",
        "🎬 4K 60fps Video Grabber",
        "🌐 Chrome & Edge Ready",
        "🔒 100% Virus & Ad Free"
    ] if not is_uninstall else [
        "🗑 Clean Removal",
        "🌐 Unregisters Extensions",
        "📁 Preserves User Files"
    ]

    y_pos = 158
    for feat in features:
        draw.text((16, y_pos), feat, fill=(180, 205, 225), font=font_feat)
        y_pos += 24

    # Bottom branding badge
    draw.line([(20, height - 48), (width - 20, height - 48)], fill=(30, 48, 65))
    
    author_text = "Created by Zihan Fakir"
    bbox = draw.textbbox((0, 0), author_text, font=font_credit)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, height - 38), author_text, fill=(220, 235, 245), font=font_credit)

    site_text = "zihan.uk"
    bbox = draw.textbbox((0, 0), site_text, font=font_credit)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, height - 24), site_text, fill=(16, 185, 129), font=font_credit)

    img.save(filename, 'BMP')
    print(f"Generated: {filename} ({width}x{height})")


def create_header_bmp(filename):
    width, height = 150, 57
    img = Image.new('RGB', (width, height), color='#0a0e17')
    draw = ImageDraw.Draw(img)

    # Subtle gradient
    for x in range(width):
        ratio = x / width
        r = int(10 + ratio * 8)
        g = int(14 + ratio * 15)
        b = int(23 + ratio * 20)
        draw.line([(x, 0), (x, height)], fill=(r, g, b))

    # Draw icon on right side (center at (125, 28))
    draw.ellipse([(108, 12), (140, 44)], fill=(16, 185, 129, 40), outline=(16, 185, 129))
    bolt = [
        (126, 16),
        (117, 28),
        (124, 28),
        (121, 40),
        (131, 27),
        (124, 27)
    ]
    draw.polygon(bolt, fill=(16, 185, 129))
    draw.polygon([(125, 18), (119, 27), (124, 27), (122, 36), (128, 27), (124, 27)], fill=(220, 255, 240))

    try:
        font_h = ImageFont.truetype("arialbd.ttf", 11)
        font_sub = ImageFont.truetype("arial.ttf", 8)
    except:
        font_h = ImageFont.load_default()
        font_sub = font_h

    draw.text((10, 14), "XDM TURBO", fill=(255, 255, 255), font=font_h)
    draw.text((10, 30), "zihan.uk • v1.0.6", fill=(16, 185, 129), font=font_sub)

    img.save(filename, 'BMP')
    print(f"Generated: {filename} ({width}x{height})")

if __name__ == '__main__':
    os.makedirs('build', exist_ok=True)
    create_sidebar_bmp('build/installerSidebar.bmp', is_uninstall=False)
    create_sidebar_bmp('build/uninstallerSidebar.bmp', is_uninstall=True)
    create_header_bmp('build/installerHeader.bmp')
