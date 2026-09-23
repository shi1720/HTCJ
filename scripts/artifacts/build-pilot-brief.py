"""GroundProof pilot brief. Requires reportlab and pypdf. All content is editable here."""
from pathlib import Path
import os
try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import HexColor
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT
    from pypdf import PdfReader
except ModuleNotFoundError as error:
    raise SystemExit(
        f"Missing PDF prerequisite: {error.name}. Install reportlab and pypdf "
        "in your Python environment. See docs/ARTIFACTS.md."
    ) from None

REPO = Path(__file__).resolve().parents[2]
WORKSPACE = Path(os.environ.get("WORKSPACE_DIR", REPO)).expanduser().resolve()
OUT = WORKSPACE / "outputs" / "groundproof-pilot-brief.pdf"
font_override = os.environ.get("ARTIFACT_FONT_DIR")
font_candidates = [Path(font_override).expanduser()] if font_override else [
    Path("/usr/share/fonts/truetype/liberation2"),
    Path("/usr/share/fonts/truetype/liberation"),
    Path("/usr/local/share/fonts/liberation"),
]
required_fonts = ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"]
FONT_DIR = next((folder for folder in font_candidates if all(
    (folder / name).is_file() for name in required_fonts
)), None)
if FONT_DIR is None:
    raise SystemExit(
        "Liberation Sans fonts were not found. Set ARTIFACT_FONT_DIR to a "
        "directory containing LiberationSans-Regular.ttf and LiberationSans-Bold.ttf. "
        "See docs/ARTIFACTS.md."
    )
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("GP", str(FONT_DIR / "LiberationSans-Regular.ttf")))
pdfmetrics.registerFont(TTFont("GP-Bold", str(FONT_DIR / "LiberationSans-Bold.ttf")))
pdfmetrics.registerFontFamily("GP",normal="GP",bold="GP-Bold",italic="GP",boldItalic="GP-Bold")
C = {"ink":"#142C29", "paper":"#F4F4EB", "muted":"#5F716B", "green":"#08694F", "line":"#CDD8CE", "lime":"#D5ED64"}
W,H = 595.28,841.89
M = 43
c = canvas.Canvas(str(OUT), pagesize=(W,H))
c.setTitle("GroundProof - Four-week shadow pilot")
c.setAuthor("Shivam Gupta")
c.setSubject("Operational evidence management for drone inspection teams")

def label(t,x,y,size=9,color="green",font="GP-Bold"):
    c.setFont(font,size);c.setFillColor(HexColor(C.get(color,color)));c.drawString(x,y,t)

def para(t,x,y,width,size=10.4,leading=14.8,color="ink",bold=False):
    style=ParagraphStyle("p",fontName="GP-Bold" if bold else "GP",fontSize=size,leading=leading,textColor=HexColor(C.get(color,color)),alignment=TA_LEFT,spaceAfter=0)
    p=Paragraph(t,style);_,height=p.wrap(width,1000);p.drawOn(c,x,y-height);return y-height

def rule(y):
    c.setStrokeColor(HexColor(C["line"]));c.setLineWidth(.7);c.line(M,y,W-M,y)

def page(n):
    c.setFillColor(HexColor(C["paper"]));c.rect(0,0,W,H,stroke=0,fill=1)
    label("GROUNDPROOF",M,H-43,10)
    label("PILOT BRIEF",W-M-64,H-43,8,"muted")
    rule(51)
    label("Shivam Gupta  /  Founder and product lead",M,34,8,"muted",font="GP")
    label(f"{n} / 2",W-M-23,34,8,"muted",font="GP")

def table(rows,widths,y,row_heights=None):
    styles=[ParagraphStyle("cell",fontName="GP",fontSize=9.5,leading=13,textColor=HexColor(C["ink"])),ParagraphStyle("head",fontName="GP-Bold",fontSize=9.3,leading=13,textColor=HexColor("#FFFFFF"))]
    data=[[Paragraph(str(value),styles[1 if r==0 else 0]) for value in row] for r,row in enumerate(rows)]
    t=Table(data,colWidths=widths,rowHeights=row_heights,hAlign="LEFT")
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),HexColor(C["ink"])),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9),("LINEBELOW",(0,1),(-1,-1),.5,HexColor(C["line"]))]))
    _,height=t.wrap(W-2*M,1000);t.drawOn(c,M,y-height);return y-height

page(1)
label("Yesterday's approval.",M,735,29,"ink")
label("Today's evidence.",M,699,29,"ink")
y=para("A four-week shadow pilot for drone inspection operators",M,670,W-2*M,13,18,"green",True)
y=para("An internal mission approval depends on facts that can change. GroundProof links jobs to source snapshots and requires a fresh decision when that evidence changes, expires, or becomes unavailable.",M,y-21,W-2*M,11.3,16)
rule(y-20)
y-=43
label("THE WORKFLOW",M,y,9)
y=para("Capture the source and its timestamp. A person reviews that exact version. The mission approval records its content hash. Later changes identify affected jobs and invalidate the old approval. An audit trail and export preserve the decision record.",M,y-16,W-2*M,10.8,15.3)
y-=29
label("WHAT THE PILOT TESTS",M,y,9)
y=para("Can a coordinator spend less time checking evidence while maintaining a clear record of current requirements? The pilot measures workflow usefulness alongside the operator's existing process. It does not release flights or replace the remote pilot's judgment.",M,y-16,W-2*M,10.8,15.3)
y-=25
y=table([['Week','Work and evidence'],['1','Map 5-10 recurring sites. Agree required sources and freshness limits. Record manual review time.'],['2','Run GroundProof in shadow mode. Compare review effort, source coverage, and discrepancies.'],['3','Run controlled source-change, expiry, outage, and stale-approval drills in a separate test workspace.'],['4','Review measured benefit and operating cost. Make a paid continuation, revise, or stop decision.']],[55,W-2*M-55],y)
y=para("Proposed scope: 10-20 source records and at least 30 job reviews if workload permits. This is a feasibility target, not a statistically powered study. No operator is currently committed.",M,y-16,W-2*M,9,12.5,"muted")
if y<65: raise RuntimeError(f"Page 1 overflow: {y}")
c.showPage()

page(2)
label("A measurable continuation decision",M,742,23,"ink")
y=para("Agree the thresholds before the pilot. Report every numerator, denominator, exception, and source gap.",M,716,W-2*M,11,15)
y=table([['Measure','Proposed acceptance threshold'],['Approval control','Zero accepted invalid approvals in the defined failure drills.'],['Source coverage','At least 90% of the agreed required sources, with uncovered requirements explicitly handled.'],['Review effort','At least 25% lower median active review time on comparable jobs, with no increase in unresolved evidence.'],['Useful alerts','At least 80% of reviewed alerts represent changes the operator considers actionable.'],['Continuation','A named budget owner agrees to a defined paid next step after seeing the results.']],[122,W-2*M-122],y-19)
y-=25
label("COMMERCIAL HYPOTHESIS",M,y,9)
y=para("Proposed future plan: <b>$199 per workspace per month</b> for 25 sites and five users. The initial pilot uses one coordinator account. Illustrative time value is $267/month at 100 jobs, four minutes saved per job, and $40/hour. At 50 jobs it is $133, below the price. The pilot must establish the actual inputs and value.",M,y-16,W-2*M,10.6,15)
y-=24
label("ENTRY CONTROLS AND STOP CONDITIONS",M,y,9)
y=para("Agree source access, required records, retention, and named reviewers. Verify deployment access controls, TLS, and backup recovery before loading operator data. Stop for an approval bypass or data-access defect. Mark failed source captures unavailable. Keep the established operational process throughout.",M,y-16,W-2*M,10.6,15)
y-=24
label("THE ASK",M,y,9)
y=para("One inspection operator, a coordinator for short weekly reviews, an experienced remote pilot or operations reviewer, and representative recurring jobs. GroundProof supplies the shadow workspace, failure drills, and a written outcome report.",M,y-16,W-2*M,10.6,15)
y=para("<b>Current evidence:</b> working software, verified authenticated Anakin retrieval, and labeled simulations. No customer traction, flight validation, certification, or measured commercial savings claimed. AI-assisted development and research.",M,y-16,W-2*M,9,12.5,"muted")
y=para('Product: <link href="https://groundproof.groundproof.workers.dev" color="#08694F">groundproof.groundproof.workers.dev</link><br/>Repository: <link href="https://github.com/shi1720/HTCJ" color="#08694F">github.com/shi1720/HTCJ</link><br/>Source context: <link href="https://www.faa.gov/uas/state-and-local-regulation-unmanned-aircraft-systems" color="#08694F">FAA jurisdiction guidance</link> and <link href="https://anakin.io/pricing" color="#08694F">Anakin pricing</link>. Research inspected September 23, 2026. Full source register and pilot definitions are in the repository.',M,y-12,W-2*M,8.3,11,"muted")
if y<65: raise RuntimeError(f"Page 2 overflow: {y}")
c.save()
reader=PdfReader(str(OUT))
assert len(reader.pages)==2
for p in reader.pages:
    assert len(p.extract_text())>500
print(OUT)
