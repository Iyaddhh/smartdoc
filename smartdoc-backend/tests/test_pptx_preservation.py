"""Lossless PPTX compression must retain every slide and package component."""
import io
import zipfile

import pytest
from fastapi import HTTPException
from PIL import Image
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches

from app.core.config import settings
from app.core.validators import validate_office_archive
from app.services.compressor.office import compress_pptx


def presentation_file(path):
    presentation = Presentation()
    image = io.BytesIO()
    Image.new("RGB", (60, 40), "red").save(image, format="JPEG", quality=100)
    for index in range(3):
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        text = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1))
        text.text = f"Slide {index + 1}: materi pelatihan"
        text.text_frame.paragraphs[0].runs[0].hyperlink.address = "https://example.com/training"
        slide.notes_slide.notes_text_frame.text = f"Catatan pembicara {index + 1}"
        slide.shapes.add_picture(io.BytesIO(image.getvalue()), Inches(1), Inches(2))
    # Hidden slides and charts also have to remain present and unchanged.
    presentation.slides[1]._element.set("show", "0")
    chart = CategoryChartData()
    chart.categories = ["A", "B"]
    chart.add_series("Hasil", [10, 20])
    presentation.slides[2].shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(2), Inches(2), Inches(4), Inches(3), chart)
    presentation.save(path)
    return path


def test_lossless_compression_preserves_all_parts_slides_notes_charts_and_images(tmp_path):
    source = presentation_file(tmp_path / "source.pptx")
    original_bytes = source.read_bytes()
    output = tmp_path / "result.pptx"
    compress_pptx(str(source), str(output), quality=1, mode="lossless")
    assert source.read_bytes() == original_bytes
    assert output.stat().st_size <= source.stat().st_size
    with zipfile.ZipFile(source) as before, zipfile.ZipFile(output) as after:
        assert before.namelist() == after.namelist()
        for name in before.namelist():
            assert before.read(name) == after.read(name), name
    presentation = Presentation(output)
    assert len(presentation.slides) == 3
    assert presentation.slides[1]._element.get("show") == "0"
    for index, slide in enumerate(presentation.slides):
        assert slide.shapes[0].text == f"Slide {index + 1}: materi pelatihan"
        assert slide.notes_slide.notes_text_frame.text == f"Catatan pembicara {index + 1}"


@pytest.mark.parametrize("fault", ["missing_slide", "changed_slide"])
def test_missing_or_changed_slide_returns_exact_original(tmp_path, monkeypatch, fault):
    source = presentation_file(tmp_path / "source.pptx")
    original_bytes = source.read_bytes()
    output = tmp_path / "result.pptx"
    write_entry = zipfile.ZipFile.writestr

    def faulty_write(archive, entry, data, **kwargs):
        name = entry.filename if isinstance(entry, zipfile.ZipInfo) else entry
        if name == "ppt/slides/slide2.xml":
            if fault == "missing_slide":
                return
            data = data.replace(b"pelatihan", b"DIHAPUS")
        return write_entry(archive, entry, data, **kwargs)

    monkeypatch.setattr(zipfile.ZipFile, "writestr", faulty_write)
    assert compress_pptx(str(source), str(output)) is False
    assert output.read_bytes() == original_bytes
    assert source.read_bytes() == original_bytes
    assert len(Presentation(output).slides) == 3


def test_input_cannot_be_overwritten(tmp_path):
    source = presentation_file(tmp_path / "source.pptx")
    original_bytes = source.read_bytes()
    with pytest.raises(ValueError, match="terpisah"):
        compress_pptx(str(source), str(source))
    assert source.read_bytes() == original_bytes


def test_pptx_above_old_component_limit_keeps_every_component(tmp_path):
    source = presentation_file(tmp_path / "many-components.pptx")
    with zipfile.ZipFile(source, "a") as archive:
        for index in range(2800):
            archive.writestr(f"customXml/component-{index}.xml", f"<component>{index}</component>")
    validate_office_archive(source.read_bytes(), ".pptx")
    output = tmp_path / "result.pptx"
    compress_pptx(str(source), str(output), mode="lossless")
    with zipfile.ZipFile(source) as before, zipfile.ZipFile(output) as after:
        assert len(before.infolist()) > 2000
        assert before.namelist() == after.namelist()
        for name in before.namelist():
            assert before.read(name) == after.read(name), name
    assert len(Presentation(output).slides) == 3


def test_component_limit_error_includes_count_and_duplicate_error_is_distinct(tmp_path, monkeypatch):
    source = presentation_file(tmp_path / "source.pptx")
    with zipfile.ZipFile(source) as archive:
        count = len(archive.infolist())
    monkeypatch.setattr(settings, "MAX_PPTX_ENTRIES", count - 1)
    with pytest.raises(HTTPException) as error:
        validate_office_archive(source.read_bytes(), ".pptx")
    assert error.value.status_code == 413
    assert str(count) in error.value.detail and str(count - 1) in error.value.detail
    monkeypatch.setattr(settings, "MAX_PPTX_ENTRIES", 20000)
    with zipfile.ZipFile(source, "a") as archive, pytest.warns(UserWarning, match="Duplicate name"):
        archive.writestr("ppt/presentation.xml", b"duplicate")
    with pytest.raises(HTTPException) as error:
        validate_office_archive(source.read_bytes(), ".pptx")
    assert error.value.status_code == 400
    assert "duplikat" in error.value.detail
