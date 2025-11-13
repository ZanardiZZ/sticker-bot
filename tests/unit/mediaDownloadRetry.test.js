/**
 * Test suite for media download retry logic
 * Validates that the retry mechanism with exponential backoff works correctly
 */

const { assertEqual } = require('../helpers/testUtils');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(relativePath) {
  return require.resolve(path.join(PROJECT_ROOT, relativePath));
}

const tests = [
  {
    name: 'downloadMediaForMessage falls back to getMediaBuffer on RPC failure',
    fn: async () => {
      const mediaDownloadPath = resolveFromRoot('utils/mediaDownload.js');
      delete require.cache[mediaDownloadPath];
      const mediaDownload = require(mediaDownloadPath);
      
      const downloadMediaCalls = [];
      const getMediaBufferCalls = [];
      
      const mockClient = {
        downloadMedia: async (messageId) => {
          downloadMediaCalls.push(messageId);
          // Simulate RPC failure
          throw new Error('media_timeout_45000ms');
        },
        getMediaBuffer: async (messageId) => {
          getMediaBufferCalls.push(messageId);
          // Fallback succeeds
          return {
            buffer: Buffer.from('test-media-data'),
            mimetype: 'image/png'
          };
        }
      };
      
      const message = {
        id: 'msg123',
        mimetype: 'image/png'
      };
      
      const result = await mediaDownload.downloadMediaForMessage(mockClient, message);
      
      assertEqual(downloadMediaCalls.length, 1, 'downloadMedia should be called once');
      assertEqual(getMediaBufferCalls.length, 1, 'getMediaBuffer should be called as fallback');
      assertEqual(result.buffer.toString(), 'test-media-data', 'Should return buffer from fallback');
      assertEqual(result.mimetype, 'image/png', 'Should return correct mimetype');
    }
  },
  
  {
    name: 'downloadMediaForMessage throws when both RPC and fallback fail',
    fn: async () => {
      const mediaDownloadPath = resolveFromRoot('utils/mediaDownload.js');
      delete require.cache[mediaDownloadPath];
      const mediaDownload = require(mediaDownloadPath);
      
      const mockClient = {
        downloadMedia: async () => {
          throw new Error('media_timeout_45000ms');
        },
        getMediaBuffer: async () => {
          throw new Error('media_not_found');
        }
      };
      
      const message = { id: 'msg456' };
      
      let didThrow = false;
      let errorMessage = '';
      try {
        await mediaDownload.downloadMediaForMessage(mockClient, message);
      } catch (err) {
        didThrow = true;
        errorMessage = err.message;
      }
      
      assertEqual(didThrow, true, 'Should throw when both methods fail');
      assertEqual(errorMessage.includes('media_download_failed'), true, 'Error should mention download failure');
    }
  },
  
  {
    name: 'downloadMediaForMessage succeeds immediately on RPC success',
    fn: async () => {
      const mediaDownloadPath = resolveFromRoot('utils/mediaDownload.js');
      delete require.cache[mediaDownloadPath];
      const mediaDownload = require(mediaDownloadPath);
      
      const getMediaBufferCalls = [];
      
      const mockClient = {
        downloadMedia: async (messageId) => {
          return {
            messageId,
            mimetype: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,' + Buffer.from('jpeg-data').toString('base64')
          };
        },
        getMediaBuffer: async (messageId) => {
          getMediaBufferCalls.push(messageId);
          throw new Error('Should not be called');
        }
      };
      
      const message = { id: 'msg789', mimetype: 'image/jpeg' };
      
      const result = await mediaDownload.downloadMediaForMessage(mockClient, message);
      
      assertEqual(getMediaBufferCalls.length, 0, 'getMediaBuffer should not be called when RPC succeeds');
      assertEqual(result.buffer.toString(), 'jpeg-data', 'Should return buffer from RPC');
      assertEqual(result.mimetype, 'image/jpeg', 'Should return correct mimetype');
    }
  },
  
  {
    name: 'downloadMediaForMessage handles missing message ID gracefully',
    fn: async () => {
      const mediaDownloadPath = resolveFromRoot('utils/mediaDownload.js');
      delete require.cache[mediaDownloadPath];
      const mediaDownload = require(mediaDownloadPath);
      
      const mockClient = {
        downloadMedia: async () => ({ dataUrl: '' }),
        getMediaBuffer: async () => ({ buffer: Buffer.from(''), mimetype: '' })
      };
      
      const messageWithoutId = { mimetype: 'image/png' };
      
      let didThrow = false;
      let errorMessage = '';
      try {
        await mediaDownload.downloadMediaForMessage(mockClient, messageWithoutId);
      } catch (err) {
        didThrow = true;
        errorMessage = err.message;
      }
      
      assertEqual(didThrow, true, 'Should throw when message ID is missing');
      assertEqual(errorMessage, 'message_id_missing', 'Should have correct error message');
    }
  }
];

module.exports = { tests };

