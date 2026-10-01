import glob
from PIL import Image, ImageFilter, ImageChops
for f in sorted(glob.glob("calibration-0*.png")):
    im = Image.open(f).convert("L")
    W,H = im.size
    blur = im.filter(ImageFilter.GaussianBlur(30))
    diff = ImageChops.difference(im, blur).point(lambda v: 255 if v > 18 else 0)
    # remove isolated noise
    diff = diff.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    bbox = diff.getbbox()
    # background row profile at x=40 (left edge) to find floor/wall transition by max vertical gradient of heavy blur
    col = [blur.getpixel((40,y)) for y in range(H)]
    colR = [blur.getpixel((W-40,y)) for y in range(H)]
    def trans(c):
        best=(0,0)
        for y in range(200,H-100):
            g=abs(c[y+20]-c[y-20])
            if g>best[0]: best=(g,y)
        return best
    x0,y0,x1,y1 = bbox
    print(f[:34], "bbox", bbox, "h%%=%.0f w%%=%.0f cx=%.0f top=%d bottom=%d" % (100*(y1-y0)/H, 100*(x1-x0)/W, (x0+x1)/2, y0, y1), "horizonL", trans(col), "horizonR", trans(colR))
