import base64, json, os, sys, urllib.request, concurrent.futures as cf
D=os.path.dirname(os.path.abspath(__file__))
key=[l.split('=',1)[1].strip().strip('"') for l in open('/Users/yan/Coding_work/riverbanks-generator/.env') if l.startswith('GEMINI_API_KEY=')][0]
COMMON=("Draw THE PROPELLER (PROSPER, kinetic economics) for a nonfiction graphic-history comic: Kate Raworth's Doughnut evolving and branching through time like a family tree. "
"The FIRST attached image is the composition to follow: a trunk of isometric doughnut rings rising from one wide shared doughnut at the bottom, joined ring to ring by soft translucent sleeves, then branching into THREE lineages (left, centre, right) that keep rising, each branch a stack of smaller rings, with faint dotted threads linking the branches (shared rivers, mutual obligations). "
"Keep a tall black arrow on the left for time. At the lower right, four ochre bars grow taller from left to right (the PROSPER stake). "
"Every ring is the Doughnut seen at the SAME isometric angle as the SECOND attached image (about 30 degrees above, visible side walls): an inner dark-teal ring (social foundation) around a hole, a band, an outer dark-teal ring (ecological ceiling). "
"Rings low in the trunk are drier and browner; rings higher up and in the branches are greener and healthier, and the three branches differ a little from one another. "
"Ligne-claire style like the THIRD and FOURTH attached images (panels from the comic): even black ink outlines, flat colour fills, no gradients except the soft translucent sleeves, no texture. "
"Palette: cream #F3ECDC background, river teal #2E6B67, mangrove green #7C9A62 and lighter tint, silt brown #8A6A48, ochre #D9A441, skin tan #B07A4E, black ink. Absolutely NO text, letters, numbers or labels anywhere. Do NOT copy the first image's words, legend, icons or bottom section: only its tree of rings. ")
SPEC={
"tree_worlds":COMMON+"Make each ring a tiny living world in the comic's style: little people, trees, rivers, stilt houses and boats on its band, few on the bare brown base, many on the green branches; the three branches hint at different ways of life: fishing boats on the left, terraced uplands in the centre, people travelling with carts and bicycles on the right.",
"tree_clean":COMMON+"Keep the rings clean and diagrammatic: no people or trees on them; instead each ring's band is divided into coloured segments (teal, green, ochre, brick red, silt brown) in slightly different arrangements per ring, showing values and measures being revised as they branch.",
}
def img(p): return {"inlineData":{"mimeType":"image/png" if p.endswith('png') else "image/jpeg","data":base64.b64encode(open(f"{D}/{p}",'rb').read()).decode()}}
def run(n):
    parts=[{"text":SPEC[n]},img("donut_tree.jpg"),img("iso_ceiling.png"),img("style_bar.jpg"),img("style_river.jpg")]
    body={"contents":[{"parts":parts}],"generationConfig":{"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":"1:1","imageSize":"2K"}}}
    req=urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent",data=json.dumps(body).encode(),headers={"Content-Type":"application/json","x-goog-api-key":key})
    r=json.load(urllib.request.urlopen(req,timeout=300))
    for part in r["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            open(f"{D}/{n}.png","wb").write(base64.b64decode(part["inlineData"]["data"])); return n+" ok"
    return n+" no image: "+json.dumps(r)[:300]
with cf.ThreadPoolExecutor(2) as ex:
    for res in ex.map(run, list(SPEC)): print(res)
