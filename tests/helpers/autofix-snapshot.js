const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const registerRoutes = require('../../modules/ai-impact/server');
const { createTestContext } = require('../../shared/server/module-context');

// Exercise the real module routes with file-backed storage and no Jira secrets.
// Each test gets its own directory, so replacing a snapshot cannot affect the
// normal integration server or another test.
function createAutofixSnapshotFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-snapshot-'));
  const storage = {
    readFromStorage(key) {
      try {
        return JSON.parse(fs.readFileSync(path.join(directory, key), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    writeToStorage(key, data) {
      const destination = path.join(directory, key);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination + '.tmp', JSON.stringify(data));
      fs.renameSync(destination + '.tmp', destination);
    }
  };
  const router = express.Router();
  registerRoutes(router, createTestContext({
    storage,
    projects: {
      get: projectId => projectId === 'osac' ? { projectId } : null,
      readArtifact: () => null
    }
  }));
  const app = express();
  app.use('/api/modules/ai-impact', router);

  return {
    app,
    router,
    publish(snapshot) {
      storage.writeToStorage('ai-impact/autofix-data.json', snapshot);
    },
    publishStatus(collectionStatus, syncStatus) {
      storage.writeToStorage('ai-impact/autofix-collection-status.json', collectionStatus);
      storage.writeToStorage('pipeline-sync-status.json', syncStatus);
    },
    remove() {
      fs.rmSync(path.join(directory, 'ai-impact/autofix-data.json'), { force: true });
    },
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

function blockedIssue(created) {
  return {
    key: 'OSAC-6214',
    summary: 'Fix osac-aap-gateway resource specs',
    status: 'POST',
    issueType: 'Bug',
    priority: 'Major',
    created,
    updated: created,
    components: ['Core'],
    assignee: null,
    labels: ['jira-autofix', 'jira-autofix-blocked'],
    pipelineState: 'autofix-blocked'
  };
}

module.exports = { createAutofixSnapshotFixture, blockedIssue };
