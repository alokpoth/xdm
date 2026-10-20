from PIL import Image, ImageDraw, ImageFont
import os

def get_font(name, size, is_bold=False):
    paths = []
    if is_bold:
        paths = ["C:\\Windows\\Fonts\\segoeuib.ttf", "segoeuib.ttf", "arialbd.ttf", "Arial Bold"]
    else:
        paths = ["C:\\Windows\\Fonts\\segoeui.ttf", "segoeui.ttf", "arial.ttf", "Arial"]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except:
            continue
    return ImageFont.load_default()

def create_sidebar_bmp(filename, is_uninstall=False):
    width, height = 164, 314
    img = Image.new('RGB', (width, height), color='#070b13')
    draw = ImageDraw.Draw(img)

    # Vertical gradient background matching obsidian theme
    for y in range(height):
        ratio = y / height
        r = int(7 + ratio * 4)
        g = int(11 + ratio * 6)
        b = int(19 + ratio * 8)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Right edge subtle highlight divider
    draw.line([(width - 1, 0), (width - 1, height)], fill=(24, 36, 52))

    # Top emerald accent bar (brand signature)
    draw.rectangle([(0, 0), (width, 3)], fill=(16, 185, 129))

    # Glowing decorative circle around icon area
    draw.ellipse([(width//2 - 38, 24), (width//2 + 38, 100)], outline=(16, 185, 129), width=1)
    draw.ellipse([(width//2 - 32, 30), (width//2 + 32, 94)], fill=(16, 185, 129, 35))

    # Draw neon lightning bolt in the center of the circle
    # Center is (82, 62)
    bolt = [
        (85, 38),
        (71, 61),
        (82, 61),
        (78, 86),
        (95, 59),
        (84, 59)
    ]
    draw.polygon(bolt, fill=(16, 185, 129))
    inner_bolt = [
        (84, 42),
        (74, 60),
        (83, 60),
        (80, 78),
        (91, 60),
        (83, 60)
    ]
    draw.polygon(inner_bolt, fill=(220, 255, 240))

    # Typography
    font_title = get_font("segoe", 16, is_bold=True)
    font_sub = get_font("segoe", 8, is_bold=True)
    font_feat = get_font("segoe", 9, is_bold=False)
    font_credit = get_font("segoe", 8, is_bold=True)

    # Main brand title
    title_text = "XDM TURBO"
    bbox = draw.textbbox((0, 0), title_text, font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, 108), title_text, fill=(255, 255, 255), font=font_title)

    sub_text = "DOWNLOAD ACCELERATOR" if not is_uninstall else "UNINSTALL WIZARD"
    bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
    tw = bbox[2] - bbox[0]
    sub_color = (16, 185, 129) if not is_uninstall else (244, 63, 94)
    draw.text(((width - tw) // 2, 128), sub_text, fill=sub_color, font=font_sub)

    # Separator
    draw.line([(20, 144), (width - 20, 144)], fill=(30, 48, 68))

    # Features
    features = [
        "⚡ 32-Stream Core Engine",
        "🎬 4K 60fps Video Grabber",
        "🌐 Chrome, Edge & Brave",
        "🔒 100% Virus & Ad Free"
    ] if not is_uninstall else [
        "🗑 Clean System Removal",
        "🌐 Deregister Extensions",
        "📁 Preserves User Files"
    ]

    y_pos = 158
    for feat in features:
        draw.text((14, y_pos), feat, fill=(203, 213, 225), font=font_feat)
        y_pos += 24

    # Bottom branding badge
    draw.line([(20, height - 52), (width - 20, height - 52)], fill=(30, 48, 68))
    
    author_text = "Official Release • 2026"
    bbox = draw.textbbox((0, 0), author_text, font=font_credit)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, height - 42), author_text, fill=(226, 232, 240), font=font_credit)

    site_text = "xdm.zihan.uk • v1.0.9"
    bbox = draw.textbbox((0, 0), site_text, font=font_credit)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, height - 26), site_text, fill=(16, 185, 129), font=font_credit)

    img.save(filename, 'BMP')
    print(f"Generated: {filename} ({width}x{height})")


def create_header_bmp(filename):
    width, height = 150, 57
    # Solid background matching control 1034 color #070b13 (7, 11, 19)
    img = Image.new('RGB', (width, height), color=(7, 11, 19))
    draw = ImageDraw.Draw(img)

    # Draw icon on right side (center at (124, 28))
    draw.ellipse([(106, 10), (142, 46)], outline=(16, 185, 129), width=1)
    draw.ellipse([(110, 14), (138, 42)], fill=(16, 185, 129, 35))

    bolt = [
        (126, 16),
        (116, 28),
        (123, 28),
        (120, 41),
        (132, 27),
        (124, 27)
    ]
    draw.polygon(bolt, fill=(16, 185, 129))
    draw.polygon([(125, 18), (118, 27), (123, 27), (121, 37), (129, 27), (124, 27)], fill=(220, 255, 240))

    font_h = get_font("segoe", 11, is_bold=True)
    font_sub = get_font("segoe", 8, is_bold=True)
    font_link = get_font("segoe", 7, is_bold=False)

    draw.text((10, 10), "XDM TURBO", fill=(255, 255, 255), font=font_h)
    draw.text((10, 26), "v1.0.9 • 32X STREAM", fill=(16, 185, 129), font=font_sub)
    draw.text((10, 40), "xdm.zihan.uk", fill=(100, 116, 139), font=font_link)

    img.save(filename, 'BMP')
    print(f"Generated: {filename} ({width}x{height})")

if __name__ == '__main__':
    os.makedirs('build', exist_ok=True)
    create_sidebar_bmp('build/installerSidebar.bmp', is_uninstall=False)
    create_sidebar_bmp('build/uninstallerSidebar.bmp', is_uninstall=True)
    create_header_bmp('build/installerHeader.bmp')
