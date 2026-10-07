import math
CREAM="#F3ECDC"; TEAL="#2E6B67"; GREEN="#9DB87F"; DGREEN="#7C9A62"; BROWN="#8A6A48"; OCHRE="#D9A441"; BRICK="#C4553A"; INK="#111"; BLUE="#3E8FB0"; WEDGE="#E9D6C4"
def pt(cx,cy,r,a): return (cx+r*math.cos(a), cy+r*math.sin(a))
def ring(cx,cy,r1,r2,fill,sw=4):
    return f'<path d="M{cx+r2},{cy} A{r2},{r2} 0 1 0 {cx-r2},{cy} A{r2},{r2} 0 1 0 {cx+r2},{cy} Z M{cx+r1},{cy} A{r1},{r1} 0 1 1 {cx-r1},{cy} A{r1},{r1} 0 1 1 {cx+r1},{cy} Z" fill="{fill}" fill-rule="evenodd" stroke="{INK}" stroke-width="{sw}"/>'
def wedge(cx,cy,r1,r2,a1,a2,fill,sw=3):
    p1=pt(cx,cy,r1,a1);p2=pt(cx,cy,r2,a1);p3=pt(cx,cy,r2,a2);p4=pt(cx,cy,r1,a2)
    lg=1 if a2-a1>math.pi else 0
    return f'<path d="M{p1[0]:.1f},{p1[1]:.1f} L{p2[0]:.1f},{p2[1]:.1f} A{r2},{r2} 0 {lg} 1 {p3[0]:.1f},{p3[1]:.1f} L{p4[0]:.1f},{p4[1]:.1f} A{r1},{r1} 0 {lg} 0 {p1[0]:.1f},{p1[1]:.1f} Z" fill="{fill}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>'
def spokes(cx,cy,r1,r2,n,off=-math.pi/2,col=CREAM,w=4):
    s=''
    for i in range(n):
        a=off+2*math.pi*i/n; p=pt(cx,cy,r1,a); q=pt(cx,cy,r2,a)
        s+=f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="{col}" stroke-width="{w}"/>'
    return s
def base(cx,cy,R=1.0,hole=None,band=GREEN,outer_r=None,bg=CREAM,outside=True):
    # Raworth geometry: hole r0, inner ring r0..r1 (social foundation), band r1..r2 (safe & just space), outer ring r2..r3 (ecological ceiling), outside to r4
    r0,r1,r2,r3,r4=150*R,185*R,300*R,335*R,455*R
    if outer_r: r2,r3=outer_r,outer_r+35*R
    s=''
    if outside:
        s+=f'<circle cx="{cx}" cy="{cy}" r="{r4}" fill="{WEDGE}" stroke="none"/>'+spokes(cx,cy,r3,r4,9,-math.pi/2+math.pi/9,bg,5)
    s+=f'<circle cx="{cx}" cy="{cy}" r="{r0}" fill="{hole or WEDGE}" stroke="none"/>'+spokes(cx,cy,0,r0,12,-math.pi/2,bg,4)
    s+=ring(cx,cy,r1,r2,band)+ring(cx,cy,r0,r1,TEAL)+ring(cx,cy,r2,r3,TEAL)
    return s,(r0,r1,r2,r3,r4)
def person(x,y,s=1,col=BROWN):
    return f'<g stroke="{INK}" stroke-width="{3*s}" stroke-linecap="round"><line x1="{x}" y1="{y}" x2="{x}" y2="{y-22*s}"/><line x1="{x-9*s}" y1="{y-14*s}" x2="{x+9*s}" y2="{y-14*s}"/><circle cx="{x}" cy="{y-30*s}" r="{8*s}" fill="{col}"/></g>'
def svg(w,h,body,bg=CREAM): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>'

# 1 FLOOR (PREMISE): canonical doughnut; no shortfall (the 12 hole wedges stay pale, none red); the social-foundation ring is outlined in ochre; people stand on it, in the safe and just space, feet on the floor, heads outward.
b,(r0,r1,r2,r3,r4)=base(500,500,hole="#F7EFE0")
glow=f'<circle cx="500" cy="500" r="{(r0+r1)/2}" fill="none" stroke="{OCHRE}" stroke-width="10"/>'+ring(500,500,r0,r1,"none",4)
ppl=''
for i in range(12):
    a=-math.pi/2+2*math.pi*(i+0.5)/12; x,y=pt(500,500,r1+1,a)
    deg=math.degrees(a)+90
    ppl+=f'<g transform="rotate({deg:.1f} {x:.1f} {y:.1f})">{person(x,y,1.2,OCHRE)}</g>'
floor=svg(1000,1000,b+glow+ppl)

# 2 CEILING (PESA): outer ring pushed out; dashed old ceiling; outward arrows; trees on the widened band.
b,(r0,r1,r2,r3,r4)=base(500,500,outer_r=345)
old=f'<circle cx="500" cy="500" r="317" fill="none" stroke="{INK}" stroke-width="5" stroke-dasharray="16 12"/>'
arr=''
for i in range(9):
    a=-math.pi/2+2*math.pi*(i+0.5)/9; p=pt(500,500,388,a); q=pt(500,500,440,a)
    l=pt(500,500,426,a-0.04); r=pt(500,500,426,a+0.04)
    arr+=f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="{TEAL}" stroke-width="12" stroke-linecap="round"/><path d="M{l[0]:.1f},{l[1]:.1f} L{pt(500,500,456,a)[0]:.1f},{pt(500,500,456,a)[1]:.1f} L{r[0]:.1f},{r[1]:.1f} Z" fill="{TEAL}" stroke="{INK}" stroke-width="3"/>'
trees=''
for i in range(6):
    a=-math.pi/2+2*math.pi*i/6+0.3; x,y=pt(500,500,262,a)
    trees+=f'<g stroke="{INK}" stroke-width="3"><rect x="{x-4:.1f}" y="{y-2:.1f}" width="8" height="20" fill="{BROWN}"/><circle cx="{x:.1f}" cy="{y-10:.1f}" r="17" fill="{DGREEN}"/></g>'
ceiling=svg(1000,1000,b+old+arr+trees)

# 3 PROPELLER (PROSPER): the full doughnut in isometric, stacked up a time axis as a rising spiral, turning brown->teal->green, branching at the top; growing bars.
def iso_doughnut(cx,cy,s,band,sq=0.36):
    r0,r1,r2,r3=150*s,185*s,300*s,335*s
    def e(r,fill,sw=4): return f'<ellipse cx="{cx}" cy="{cy}" rx="{r:.1f}" ry="{r*sq:.1f}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'
    side=f'<path d="M{cx-r3:.1f},{cy} L{cx-r3:.1f},{cy+18*s:.1f} A{r3:.1f},{r3*sq:.1f} 0 0 0 {cx+r3:.1f},{cy+18*s:.1f} L{cx+r3:.1f},{cy} Z" fill="#1f4d4a" stroke="{INK}" stroke-width="4"/>'
    return side+e(r3,TEAL)+e(r2,band)+e(r1,TEAL)+e(r0,CREAM)
body=''
levels=[(700,0.62,"#B9A27E"),(560,0.58,"#8FB0A0"),(420,0.54,GREEN),(285,0.50,"#86B86A")]
body+=f'<line x1="500" y1="760" x2="500" y2="60" stroke="{INK}" stroke-width="6" stroke-linecap="round"/><path d="M482,72 L500,36 L518,72 Z" fill="{INK}"/>'
for y,s,c in levels: body+=iso_doughnut(500,y,s,c)
# spiral ribbon connecting the levels (front edge)
body+=f'<path d="M708,700 C800,670 790,600 690,565 M300,560 C200,530 210,460 318,425 M680,420 C770,390 760,320 660,288" fill="none" stroke="{OCHRE}" stroke-width="10" stroke-linecap="round"/>'
for (x,y,s) in [(720,195,0.18),(820,150,0.13),(290,180,0.15)]:
    body+=f'<line x1="500" y1="270" x2="{x}" y2="{y}" stroke="{INK}" stroke-width="3"/>'+iso_doughnut(x,y,s,"#86B86A")
# flat doughnut at start (left) and growing bars (right)
body+=f'<g transform="translate(0,0)">'+''.join(f'<rect x="{850+i*30}" y="{900-h}" width="22" height="{h}" fill="{OCHRE}" stroke="{INK}" stroke-width="3"/>' for i,h in enumerate([40,80,130,190]))+'</g>'
fb,_=base(150,840,R=0.3,outside=False)
body+=fb+f'<path d="M265,840 L330,800" stroke="{TEAL}" stroke-width="10" stroke-linecap="round"/><path d="M318,786 L352,786 L336,816 Z" fill="{TEAL}" stroke="{INK}" stroke-width="3"/>'
propeller=svg(1000,1000,body)

# 4 MYITSONE: on the dark screen; red SHORTFALL wedges breach the social foundation on the left (inner ring broken), while the ceiling on the right is pushed outward in blue.
DARK="#1d2b2b"
b,(r0,r1,r2,r3,r4)=base(500,500,bg=DARK,outside=False,hole="#2a3a3a")
short=''
for i in [7,8,9]:
    a1=-math.pi/2+2*math.pi*i/12+0.03; a2=-math.pi/2+2*math.pi*(i+1)/12-0.03
    short+=wedge(500,500,40,r1+6,a1,a2,BRICK,4)
crack=f'<path d="M{pt(500,500,r1,math.pi*1.02)[0]:.0f},{pt(500,500,r1,math.pi*1.02)[1]:.0f} l-14,-18 l10,-12 l-16,-20" fill="none" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>'
a1,a2=-math.pi*0.42,math.pi*0.42
exp=wedge(500,500,r3,r3+60,a1,a2,BLUE,5)+f'<path d="M{pt(500,500,r3+60,a1)[0]:.0f},{pt(500,500,r3+60,a1)[1]:.0f} A{r3+60},{r3+60} 0 1 0 {pt(500,500,r3+60,a2)[0]:.0f},{pt(500,500,r3+60,a2)[1]:.0f}" fill="none" stroke="#6FA3A0" stroke-width="5" stroke-dasharray="16 12"/>'
marr=''
for a in [-0.8,-0.27,0.27,0.8]:
    p=pt(500,500,r3+70,a); q=pt(500,500,r3+120,a); l=pt(500,500,r3+108,a-0.06); r=pt(500,500,r3+108,a+0.06); t=pt(500,500,r3+140,a)
    marr+=f'<line x1="{p[0]:.0f}" y1="{p[1]:.0f}" x2="{q[0]:.0f}" y2="{q[1]:.0f}" stroke="{BLUE}" stroke-width="14" stroke-linecap="round"/><path d="M{l[0]:.0f},{l[1]:.0f} L{t[0]:.0f},{t[1]:.0f} L{r[0]:.0f},{r[1]:.0f} Z" fill="{BLUE}" stroke="{INK}" stroke-width="3"/>'
myit=svg(1000,1000,b+exp+short+crack+marr,DARK)

for n,s in [("floor",floor),("ceiling",ceiling),("propeller",propeller),("myitsone",myit)]:
    open(n+".svg","w").write(s)
print("ok")
