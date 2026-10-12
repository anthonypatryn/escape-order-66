# Art pipeline: the owner's print files in ART/ → web-sized images in public/art/.
# Run from the project root:  python tools/art.py
# ART/ itself is not committed (print PDFs, InDesign files); only these outputs are.
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'ART')
OUT = os.path.join(ROOT, 'public', 'art')
CARDS = os.path.join(ART, 'Cards')
DECK = os.path.join(ART, 'Companion Deck Folder', 'Companion Deck Folder')
TOK = os.path.join(ART, 'Tokens', '2x')

# card file number → character id (see src/data/cards.js)
CHARS = {
    3: 'cad-bane', 4: 'aurra-sing',
    5: 'dooku', 6: 'gunray', 7: 'grievous',
    8: 'ventress', 9: 'maul', 10: 'savage', 11: 'talzin',
    12: 'hunter', 13: 'wrecker', 14: 'tech', 15: 'echo', 16: 'crosshair',
    17: 'amedda', 18: 'palpatine', 19: 'anakin', 20: 'tarkin', 21: 'thrawn', 22: 'krennic',
    23: 'fisto', 24: 'plo', 25: 'yoda', 26: 'windu', 27: 'obiwan', 28: 'shaak', 29: 'mundi',
    30: 'hevy', 31: 'cody', 32: 'fives', 33: 'ninety-nine', 34: 'gregor', 35: 'wolffe', 36: 'jesse', 37: 'howzer',
}
# Companion Deck<n>.jpg → encounter id. #16 is a second, smaller export of Bo-Katan: not used (14 encounters).
ENCS = {2: 'hondo', 3: 'waxer', 4: 'rex', 5: 'saw', 6: 'fennec', 7: 'omega', 8: 'krell', 9: 'sidious',
        10: 'huyang', 11: 'nightsisters', 12: 'droids', 13: 'satine', 14: 'trench', 15: 'bokatan'}
# hex faction tokens
TOKENS = {'Artboard 1': 'clone', 'Artboard 1 copy 2': 'jedi', 'Artboard 1 copy 6': 'empire', 'Artboard 1 copy 5': 'badbatch',
          'Artboard 1 copy 4': 'dathomir', 'Artboard 1 copy 3': 'separatists', 'Artboard 1 copy': 'bounty'}


def save(im, path, w, q=86):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = im.convert('RGB')
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(path, quality=q, optimize=True, progressive=True)


def main():
    for n, cid in CHARS.items():
        save(Image.open(os.path.join(CARDS, f'Escape Order 66{n}.jpg')), os.path.join(OUT, 'chars', f'{cid}.jpg'), 440)
    save(Image.open(os.path.join(CARDS, 'Escape Order 66.jpg')), os.path.join(OUT, 'ahsoka.jpg'), 440)
    save(Image.open(os.path.join(CARDS, 'Escape Order 662.jpg')), os.path.join(OUT, 'card-back.jpg'), 440)
    save(Image.open(os.path.join(CARDS, 'Escape Order 662.jpg')), os.path.join(OUT, 'home-bg.jpg'), 898, 80)
    for n, eid in ENCS.items():
        save(Image.open(os.path.join(DECK, f'Companion Deck{n}.jpg')), os.path.join(OUT, 'enc', f'{eid}.jpg'), 520)
    save(Image.open(os.path.join(DECK, 'Companion Deck.jpg')), os.path.join(OUT, 'enc-back.jpg'), 520)
    for f, fid in TOKENS.items():  # hexagons on white: the page clips them to the hex shape (CSS clip-path)
        save(Image.open(os.path.join(TOK, f'{f}@2x-100.jpg')), os.path.join(OUT, 'tokens', f'{fid}.jpg'), 300)
    tb = Image.open(os.path.join(ART, 'Tokens', 'Tokens.png')).convert('RGBA')
    tb.thumbnail((280, 280), Image.LANCZOS)
    tb.save(os.path.join(OUT, 'token-back.png'), optimize=True)
    # the owner's logo (vector): crisp at any size
    import fitz
    logo = fitz.open(os.path.join(DECK, 'Links', 'logo.ai'))[0]
    open(os.path.join(OUT, 'logo.svg'), 'w', encoding='utf8').write(logo.get_svg_image(text_as_path=True))
    # favicon: Ahsoka's card, full bleed
    card = Image.open(os.path.join(CARDS, 'Escape Order 66.jpg')).convert('RGB')
    card.crop((200, 200, 698, 698)).resize((64, 64), Image.LANCZOS).save(os.path.join(ROOT, 'public', 'favicon.png'))
    # iPhone home-screen icon: Ahsoka's medallion over the logo (iOS rounds the corners itself)
    home_icon(card, logo)
    print('done')


def home_icon(card, logo_page):
    import fitz
    from PIL import ImageDraw, ImageFilter
    N = 720
    pix = logo_page.get_pixmap(matrix=fitz.Matrix(4, 4), alpha=True)
    logo = Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)
    logo = logo.crop(logo.getbbox())
    bg = card.crop((201, 236, 698, 733)).resize((N, N), Image.LANCZOS)  # medallion high, name plate under the logo
    shade = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(shade)
    for y in range(N):
        t = max(0, (y - N * 0.6) / (N * 0.15))
        d.line([(0, y), (N, y)], fill=int(250 * min(1, t) ** 1.2))
    bg = Image.composite(Image.new('RGB', (N, N), (5, 7, 13)), bg, shade).convert('RGBA')
    w = int(N * 0.9)
    lg = logo.resize((w, int(logo.height * w / logo.width)), Image.LANCZOS)
    pos = ((N - w) // 2, int(N * 0.93) - lg.height)
    shadow = Image.new('RGBA', lg.size, (0, 0, 0, 255))
    shadow.putalpha(lg.split()[3])
    glow = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    glow.paste(shadow, pos, shadow)
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    bg.alpha_composite(glow)
    bg.alpha_composite(glow)
    bg.alpha_composite(lg, pos)
    icon = bg.convert('RGB')
    os.makedirs(os.path.join(ROOT, 'public', 'icons'), exist_ok=True)
    for size in (180, 192, 512):
        icon.resize((size, size), Image.LANCZOS).save(os.path.join(ROOT, 'public', 'icons', f'eo66-icon-{size}.png'), optimize=True)
    # iOS also asks for this exact path on its own
    icon.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'public', 'apple-touch-icon.png'), optimize=True)


if __name__ == '__main__':
    main()
