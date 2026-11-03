import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("ja-upstream-sync.sh")


class UpstreamSyncContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.upstream = root / "upstream"
        self.fork = root / "fork"
        self.output = root / "outputs"
        self.upstream.mkdir()
        self.git(self.upstream, "init", "--initial-branch=main")
        self.identity(self.upstream)
        self.commit(self.upstream, "initial")
        self.git(root, "clone", str(self.upstream), str(self.fork))
        self.identity(self.fork)
        self.original = self.git(self.fork, "rev-parse", "HEAD")

    def git(self, directory, *args):
        return subprocess.check_output(
            ["git", *args], cwd=directory, text=True, stderr=subprocess.DEVNULL
        ).strip()

    def identity(self, directory):
        self.git(directory, "config", "user.name", "Sync fixture")
        self.git(directory, "config", "user.email", "fixture@example.invalid")
        self.git(directory, "config", "commit.gpgsign", "false")

    def commit(self, directory, value):
        (directory / "version.txt").write_text(value)
        self.git(directory, "add", "version.txt")
        self.git(directory, "commit", "-m", "fixture update")

    def run_sync(self):
        env = {**os.environ, "GITHUB_OUTPUT": str(self.output)}
        return subprocess.run(
            ["bash", str(SCRIPT), str(self.upstream)],
            cwd=self.fork,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )

    def test_unchanged_source_does_not_create_a_commit(self):
        result = self.run_sync()
        self.assertEqual(result.returncode, 0)
        self.assertIn("changed=false", self.output.read_text())
        self.assertEqual(self.git(self.fork, "rev-parse", "HEAD"), self.original)
        self.assertFalse((self.fork / ".git/MERGE_HEAD").exists())

    def test_merge_is_prepared_for_validation_before_commit(self):
        self.commit(self.upstream, "upstream update")
        result = self.run_sync()
        self.assertEqual(result.returncode, 0)
        self.assertIn("changed=true", self.output.read_text())
        self.assertEqual((self.fork / "version.txt").read_text(), "upstream update")
        self.assertTrue((self.fork / ".git/MERGE_HEAD").exists())
        self.assertEqual(self.git(self.fork, "rev-parse", "HEAD"), self.original)

    def test_conflicting_source_fails_without_advancing_fork(self):
        self.commit(self.fork, "fork update")
        before = self.git(self.fork, "rev-parse", "HEAD")
        self.commit(self.upstream, "upstream update")
        result = self.run_sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("changed=true", self.output.read_text())
        self.assertEqual(self.git(self.fork, "rev-parse", "HEAD"), before)

    def test_fork_workflow_configuration_survives_upstream_changes(self):
        folder = self.upstream / ".github/workflows"
        folder.mkdir(parents=True)
        (folder / "publish.yml").write_text("upstream-publisher")
        self.git(self.upstream, "add", ".github/workflows")
        self.git(self.upstream, "commit", "-m", "fixture workflow")
        self.git(self.fork, "fetch", "origin", "main")
        self.git(self.fork, "merge", "--ff-only", "FETCH_HEAD")
        fork_folder = self.fork / ".github/workflows"
        (fork_folder / "publish.yml").write_text("fork-publisher-guard")
        self.git(self.fork, "add", ".github/workflows")
        self.git(self.fork, "commit", "-m", "fixture fork configuration")
        (folder / "publish.yml").write_text("new-upstream-publisher")
        self.git(self.upstream, "add", ".github/workflows")
        self.git(self.upstream, "commit", "-m", "fixture upstream change")
        result = self.run_sync()
        self.assertEqual(result.returncode, 0)
        self.assertEqual((fork_folder / "publish.yml").read_text(), "fork-publisher-guard")
        self.assertIn("changed=true", self.output.read_text())


if __name__ == "__main__":
    unittest.main()
