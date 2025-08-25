#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Connect to the database
const DB_PATH = './media.db'; // Use the same database as the main app
const db = new sqlite3.Database(DB_PATH);

async function addTestData() {
  console.log('Adding test data...');
  
  try {
    // Create a test user
    const username = 'testuser';
    const password = 'test123';
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert test user
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR IGNORE INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
        [username, passwordHash, 'user', Date.now()],
        function(err) {
          if (err) {
            console.error('Error inserting user:', err);
            reject(err);
          } else {
            console.log(`Test user '${username}' created (or already exists).`);
            resolve();
          }
        }
      );
    });
    
    // Create a test sticker entry
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR IGNORE INTO media (id, chat_id, group_id, sender_id, file_path, mimetype, timestamp, description, hash_visual, hash_md5, nsfw, count_random) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 'test-chat', 'test-group', 'test-sender', '/fake/path/test.webp', 'image/webp', Math.floor(Date.now()/1000), 'Test sticker description', 'testhash123456789', 'testmd5hash', 0, 5],
        function(err) {
          if (err) {
            console.error('Error inserting sticker:', err);
            reject(err);
          } else {
            console.log('Test sticker created (or already exists).');
            resolve();
          }
        }
      );
    });
    
    // Add some test tags
    const tagNames = ['test', 'exemplo', 'demo'];
    for (const tagName of tagNames) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR IGNORE INTO tags (name, usage_count) VALUES (?, ?)',
          [tagName, 1],
          function(err) {
            if (err) {
              console.error('Error inserting tag:', err);
              reject(err);
            } else {
              console.log(`Tag '${tagName}' created.`);
              resolve();
            }
          }
        );
      });
    }
    
    // Link tags to sticker
    for (let i = 0; i < tagNames.length; i++) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)',
          [1, i + 1],
          function(err) {
            if (err) {
              console.error('Error linking tag:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    }
    
    console.log('Test data added successfully!');
    console.log('You can now login with username: testuser, password: test123');
    
  } catch (error) {
    console.error('Error adding test data:', error);
  } finally {
    db.close();
  }
}

addTestData();