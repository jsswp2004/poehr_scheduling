import os

from django.test import SimpleTestCase

from poehr_scheduling_backend.settings import BASE_DIR, resolve_media_root


class MediaRootTests(SimpleTestCase):
    def test_uses_the_persistent_disk_when_it_is_mounted(self):
        self.assertEqual(resolve_media_root({}, lambda p: p == "/var/data"), "/var/data/media")

    def test_an_explicit_setting_wins(self):
        self.assertEqual(resolve_media_root({"MEDIA_ROOT": "/srv/files"}, lambda p: True), "/srv/files")

    def test_falls_back_to_the_local_media_folder(self):
        self.assertEqual(resolve_media_root({}, lambda p: False), os.path.join(BASE_DIR, "media"))
