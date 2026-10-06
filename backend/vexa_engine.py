from PIL import Image, ImageOps
import numpy as np
import trimesh


# ============================================================
# SETTINGS
# ============================================================

MAX_IMAGE_SIZE = 560

FRONT_DEPTH = 0.95
BACK_DEPTH = 0.88


# ============================================================
# IMAGE
# ============================================================

def load_image(path):

    image = Image.open(path)

    image = ImageOps.exif_transpose(image)

    image = image.convert("RGBA")

    alpha = np.asarray(
        image.getchannel("A"),
        dtype=np.uint8
    )

    if alpha.max() == 0:
        raise ValueError(
            "No visible object was detected."
        )

    bbox = image.getbbox()

    if bbox:
        image = image.crop(bbox)

    width, height = image.size

    if max(width, height) > MAX_IMAGE_SIZE:

        scale = MAX_IMAGE_SIZE / max(
            width,
            height
        )

        image = image.resize(
            (
                max(
                    2,
                    int(width * scale)
                ),
                max(
                    2,
                    int(height * scale)
                )
            ),
            Image.Resampling.LANCZOS
        )

    return image


# ============================================================
# MASK
# ============================================================

def create_mask(image):

    rgba = np.asarray(
        image,
        dtype=np.uint8
    )

    alpha = rgba[:, :, 3]

    mask = alpha > 15

    if mask.sum() < 50:
        raise ValueError(
            "Object could not be detected."
        )

    # Small isolated-pixel cleanup.
    for _ in range(2):

        padded = np.pad(
            mask,
            1,
            mode="constant",
            constant_values=False
        )

        neighbours = (
            padded[:-2, 1:-1] &
            padded[2:, 1:-1]
        ) | (
            padded[1:-1, :-2] &
            padded[1:-1, 2:]
        )

        mask = mask & neighbours

    return rgba, mask


# ============================================================
# SILHOUETTE DEPTH
# ============================================================

def create_depth(mask):

    height, width = mask.shape

    depth = np.zeros(
        (height, width),
        dtype=np.float32
    )

    rows = np.where(
        mask.any(axis=1)
    )[0]

    if len(rows) == 0:
        raise ValueError(
            "Invalid object mask."
        )

    top = int(rows[0])
    bottom = int(rows[-1])

    total_height = max(
        1,
        bottom - top
    )

    # --------------------------------------------------------
    # Calculate rounded depth from silhouette.
    # --------------------------------------------------------

    for y in range(
        top,
        bottom + 1
    ):

        xs = np.where(
            mask[y]
        )[0]

        if len(xs) == 0:
            continue

        left = int(xs[0])
        right = int(xs[-1])

        row_width = max(
            1,
            right - left
        )

        for x in xs:

            # -----------------------------------------------
            # Horizontal radius
            # -----------------------------------------------

            nx = (
                2.0 *
                (x - left) /
                row_width
            ) - 1.0

            nx = max(
                -1.0,
                min(
                    1.0,
                    nx
                )
            )

            horizontal = np.sqrt(
                max(
                    0.0,
                    1.0 - nx * nx
                )
            )

            # -----------------------------------------------
            # Vertical radius
            # -----------------------------------------------

            ny = (
                2.0 *
                (y - top) /
                total_height
            ) - 1.0

            ny = max(
                -1.0,
                min(
                    1.0,
                    ny
                )
            )

            vertical = np.sqrt(
                max(
                    0.0,
                    1.0 - ny * ny
                )
            )

            # -----------------------------------------------
            # Object volume
            # -----------------------------------------------

            volume = (
                horizontal ** 0.72
            ) * (
                vertical ** 0.55
            )

            # Keep a small amount of volume near edges.
            volume = (
                0.18 +
                0.82 * volume
            )

            depth[y, x] = (
                FRONT_DEPTH *
                volume
            )

    # --------------------------------------------------------
    # Smooth the depth field.
    # --------------------------------------------------------

    for _ in range(3):

        new_depth = depth.copy()

        for y in range(
            1,
            height - 1
        ):

            for x in range(
                1,
                width - 1
            ):

                if not mask[y, x]:
                    continue

                values = []

                for yy, xx in (
                    (y - 1, x),
                    (y + 1, x),
                    (y, x - 1),
                    (y, x + 1)
                ):

                    if mask[yy, xx]:
                        values.append(
                            depth[yy, xx]
                        )

                if values:

                    new_depth[y, x] = (
                        depth[y, x] * 0.65 +
                        np.mean(values) * 0.35
                    )

        depth = new_depth

    return depth


# ============================================================
# MESH
# ============================================================

def create_mesh(mask, depth):

    height, width = mask.shape

    scale = float(
        max(
            width,
            height
        )
    )

    vertex_map = -np.ones(
        (height, width),
        dtype=np.int32
    )

    vertices = []

    uvs = []

    # ========================================================
    # FRONT
    # ========================================================

    for y in range(height):

        for x in range(width):

            if not mask[y, x]:
                continue

            px = (
                (x - (width - 1) / 2.0)
                / scale
            ) * 2.7

            py = (
                ((height - 1) / 2.0 - y)
                / scale
            ) * 2.7

            pz = float(
                depth[y, x]
            )

            vertex_map[y, x] = len(
                vertices
            )

            vertices.append([
                px,
                py,
                pz
            ])

            u = (
                x /
                max(
                    1,
                    width - 1
                )
            )

            v = 1.0 - (
                y /
                max(
                    1,
                    height - 1
                )
            )

            uvs.append([
                u,
                v
            ])

    front_count = len(vertices)

    # ========================================================
    # BACK
    # ========================================================

    for i in range(front_count):

        x, y, z = vertices[i]

        vertices.append([
            x,
            y,
            -z * BACK_DEPTH
        ])

        uvs.append(
            uvs[i]
        )

    faces = []

    # ========================================================
    # FRONT + BACK SURFACE
    # ========================================================

    for y in range(
        height - 1
    ):

        for x in range(
            width - 1
        ):

            a = vertex_map[y, x]
            b = vertex_map[y, x + 1]
            c = vertex_map[y + 1, x]
            d = vertex_map[y + 1, x + 1]

            if (
                a >= 0 and
                b >= 0 and
                c >= 0 and
                d >= 0
            ):

                faces.append([
                    a,
                    b,
                    d
                ])

                faces.append([
                    a,
                    d,
                    c
                ])

                ba = a + front_count
                bb = b + front_count
                bc = c + front_count
                bd = d + front_count

                faces.append([
                    ba,
                    bd,
                    bb
                ])

                faces.append([
                    ba,
                    bc,
                    bd
                ])

    # ========================================================
    # SIDE WALLS
    # ========================================================

    def make_point(
        x,
        y,
        z
    ):

        px = (
            (x - (width - 1) / 2.0)
            / scale
        ) * 2.7

        py = (
            ((height - 1) / 2.0 - y)
            / scale
        ) * 2.7

        return [
            px,
            py,
            z
        ]

    for y in range(height):

        for x in range(width):

            if not mask[y, x]:
                continue

            z = float(
                depth[y, x]
            )

            u = (
                x /
                max(
                    1,
                    width - 1
                )
            )

            v = 1.0 - (
                y /
                max(
                    1,
                    height - 1
                )
            )

            # ------------------------------------------------
            # LEFT
            # ------------------------------------------------

            if (
                x == 0 or
                not mask[y, x - 1]
            ):

                s = len(vertices)

                vertices.extend([
                    make_point(
                        x - 0.5,
                        y - 0.5,
                        z
                    ),
                    make_point(
                        x - 0.5,
                        y + 0.5,
                        z
                    ),
                    make_point(
                        x - 0.5,
                        y + 0.5,
                        -z * BACK_DEPTH
                    ),
                    make_point(
                        x - 0.5,
                        y - 0.5,
                        -z * BACK_DEPTH
                    )
                ])

                uvs.extend([
                    [u, 1],
                    [u, 0],
                    [u, 0],
                    [u, 1]
                ])

                faces.extend([
                    [s, s + 1, s + 2],
                    [s, s + 2, s + 3]
                ])

            # ------------------------------------------------
            # RIGHT
            # ------------------------------------------------

            if (
                x == width - 1 or
                not mask[y, x + 1]
            ):

                s = len(vertices)

                vertices.extend([
                    make_point(
                        x + 0.5,
                        y + 0.5,
                        z
                    ),
                    make_point(
                        x + 0.5,
                        y - 0.5,
                        z
                    ),
                    make_point(
                        x + 0.5,
                        y - 0.5,
                        -z * BACK_DEPTH
                    ),
                    make_point(
                        x + 0.5,
                        y + 0.5,
                        -z * BACK_DEPTH
                    )
                ])

                uvs.extend([
                    [u, 0],
                    [u, 1],
                    [u, 1],
                    [u, 0]
                ])

                faces.extend([
                    [s, s + 1, s + 2],
                    [s, s + 2, s + 3]
                ])

            # ------------------------------------------------
            # TOP
            # ------------------------------------------------

            if (
                y == 0 or
                not mask[y - 1, x]
            ):

                s = len(vertices)

                vertices.extend([
                    make_point(
                        x - 0.5,
                        y - 0.5,
                        z
                    ),
                    make_point(
                        x + 0.5,
                        y - 0.5,
                        z
                    ),
                    make_point(
                        x + 0.5,
                        y - 0.5,
                        -z * BACK_DEPTH
                    ),
                    make_point(
                        x - 0.5,
                        y - 0.5,
                        -z * BACK_DEPTH
                    )
                ])

                uvs.extend([
                    [u, 1],
                    [u, 1],
                    [u, 0],
                    [u, 0]
                ])

                faces.extend([
                    [s, s + 1, s + 2],
                    [s, s + 2, s + 3]
                ])

            # ------------------------------------------------
            # BOTTOM
            # ------------------------------------------------

            if (
                y == height - 1 or
                not mask[y + 1, x]
            ):

                s = len(vertices)

                vertices.extend([
                    make_point(
                        x + 0.5,
                        y + 0.5,
                        z
                    ),
                    make_point(
                        x - 0.5,
                        y + 0.5,
                        z
                    ),
                    make_point(
                        x - 0.5,
                        y + 0.5,
                        -z * BACK_DEPTH
                    ),
                    make_point(
                        x + 0.5,
                        y + 0.5,
                        -z * BACK_DEPTH
                    )
                ])

                uvs.extend([
                    [u, 0],
                    [u, 0],
                    [u, 1],
                    [u, 1]
                ])

                faces.extend([
                    [s, s + 1, s + 2],
                    [s, s + 2, s + 3]
                ])

    return (
        np.asarray(
            vertices,
            dtype=np.float64
        ),
        np.asarray(
            faces,
            dtype=np.int64
        ),
        np.asarray(
            uvs,
            dtype=np.float32
        )
    )


# ============================================================
# COLOR MATERIAL
# ============================================================

def apply_color(
    mesh,
    rgba,
    uvs
):

    image = Image.fromarray(
        rgba,
        mode="RGBA"
    )

    material = trimesh.visual.material.SimpleMaterial(
        image=image,
        diffuse=[
            255,
            255,
            255,
            255
        ]
    )

    mesh.visual = trimesh.visual.texture.TextureVisuals(
        uv=uvs,
        image=image,
        material=material
    )


# ============================================================
# NO COLOR MATERIAL
# ============================================================

def apply_no_color(mesh):

    # --------------------------------------------------------
    # IMPORTANT:
    #
    # Do NOT use TextureVisuals here.
    #
    # We explicitly assign a color to EVERY FACE.
    # This makes the GLB work reliably in Three.js.
    # --------------------------------------------------------

    gray = np.array(
        [
            180,
            185,
            192,
            255
        ],
        dtype=np.uint8
    )

    face_colors = np.tile(
        gray,
        (
            len(mesh.faces),
            1
        )
    )

    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh,
        face_colors=face_colors
    )


# ============================================================
# MAIN
# ============================================================

def create_textured_3d(
    image_path,
    output_path,
    color=True
):

    print()
    print(
        "[VEXA ENGINE] Starting reconstruction..."
    )

    image = load_image(
        image_path
    )

    rgba, mask = create_mask(
        image
    )

    print(
        "[VEXA ENGINE] Image:",
        image.size
    )

    print(
        "[VEXA ENGINE] Object pixels:",
        int(mask.sum())
    )

    depth = create_depth(
        mask
    )

    vertices, faces, uvs = create_mesh(
        mask,
        depth
    )

    if len(vertices) == 0:
        raise ValueError(
            "No vertices generated."
        )

    if len(faces) == 0:
        raise ValueError(
            "No faces generated."
        )

    print(
        "[VEXA ENGINE] Vertices:",
        len(vertices)
    )

    print(
        "[VEXA ENGINE] Faces:",
        len(faces)
    )

    mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        process=False
    )

    mesh.remove_unreferenced_vertices()

    mesh.fix_normals()

    # --------------------------------------------------------
    # COLOR
    # --------------------------------------------------------

    if color:

        print(
            "[VEXA ENGINE] Applying COLOR texture..."
        )

        # Since remove_unreferenced_vertices() can
        # change vertex indices, resize UVs safely.
        if len(uvs) != len(mesh.vertices):

            fixed_uvs = np.zeros(
                (
                    len(mesh.vertices),
                    2
                ),
                dtype=np.float32
            )

            count = min(
                len(uvs),
                len(fixed_uvs)
            )

            fixed_uvs[:count] = uvs[:count]

            uvs = fixed_uvs

        apply_color(
            mesh,
            rgba,
            uvs
        )

    # --------------------------------------------------------
    # NO COLOR
    # --------------------------------------------------------

    else:

        print(
            "[VEXA ENGINE] Applying NO COLOR face material..."
        )

        apply_no_color(
            mesh
        )

    # --------------------------------------------------------
    # EXPORT
    # --------------------------------------------------------

    print(
        "[VEXA ENGINE] Exporting GLB..."
    )

    mesh.export(
        output_path,
        file_type="glb"
    )

    print(
        "[VEXA ENGINE] Finished:",
        output_path
    )

    print()

    return output_path