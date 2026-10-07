import os
import uuid
import traceback

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from vexa_engine import create_textured_3d


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_DIR = os.path.join(
    BASE_DIR,
    "uploads"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "output"
)

os.makedirs(
    UPLOAD_DIR,
    exist_ok=True
)

os.makedirs(
    OUTPUT_DIR,
    exist_ok=True
)


app = FastAPI(
    title="VEXA 3D Engine",
    description="VEXA AI 2D to 3D Reconstruction Engine",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://vexa-lemon-six.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


app.mount(
    "/output",
    StaticFiles(directory=OUTPUT_DIR),
    name="output"
)


@app.get("/")
def root():

    return {
        "message": "VEXA 3D Engine is running",
        "status": "ready"
    }


@app.post("/generate-3d")
async def generate_3d(
    file: UploadFile = File(...)
):

    image_id = str(uuid.uuid4())

    input_path = os.path.join(
        UPLOAD_DIR,
        f"{image_id}.png"
    )

    color_output = os.path.join(
        OUTPUT_DIR,
        f"{image_id}_color.glb"
    )

    no_color_output = os.path.join(
        OUTPUT_DIR,
        f"{image_id}_no_color.glb"
    )

    try:

        print()
        print("=" * 60)
        print("[VEXA] New image received")
        print("=" * 60)

        data = await file.read()

        if not data:
            raise ValueError(
                "Uploaded image is empty."
            )

        with open(
            input_path,
            "wb"
        ) as output_file:

            output_file.write(data)

        print(
            f"[VEXA] Input saved: {input_path}"
        )

        print(
            "[VEXA] Creating COLOR model..."
        )

        create_textured_3d(
            input_path,
            color_output,
            color=True
        )

        print(
            "[VEXA] COLOR model created."
        )

        print(
            "[VEXA] Creating NO COLOR model..."
        )

        create_textured_3d(
            input_path,
            no_color_output,
            color=False
        )

        print(
            "[VEXA] NO COLOR model created."
        )

        print(
            "[VEXA] Generation completed."
        )

        print("=" * 60)
        print()

        return {
            "success": True,
            "color": f"/output/{image_id}_color.glb",
            "no_color": f"/output/{image_id}_no_color.glb"
        }

    except Exception as error:

        print()
        print("=" * 60)
        print("[VEXA ERROR]")
        print(str(error))
        traceback.print_exc()
        print("=" * 60)
        print()

        return {
            "success": False,
            "error": str(error)
        }