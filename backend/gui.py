import sys
import sqlite3
import os
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QListWidget, QListWidgetItem, QTextEdit, QLabel, QPushButton, 
                             QSplitter, QFrame, QMessageBox, QComboBox)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QPixmap, QImage
import requests
import json
from nlp_processor import process_story

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mercury.db")

class MercuryGUI(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Caledonian Mercury - Curation Cockpit")
        self.resize(1400, 900)
        
        self.init_ui()
        self.load_stories()

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QHBoxLayout(central_widget)

        # Left Side: Story List & Filter
        left_panel = QWidget()
        left_panel.setFixedWidth(350)
        left_layout = QVBoxLayout(left_panel)
        
        self.status_filter = QComboBox()
        self.status_filter.addItems(["staged", "accepted", "processed", "rejected"])
        self.status_filter.currentTextChanged.connect(self.load_stories)
        left_layout.addWidget(QLabel("Filter by Status:"))
        left_layout.addWidget(self.status_filter)

        self.story_list = QListWidget()
        self.story_list.currentRowChanged.connect(self.display_story)
        left_layout.addWidget(self.story_list)
        
        # Right Side: Detail View
        detail_splitter = QSplitter(Qt.Orientation.Vertical)
        
        # Top half: Content & Image
        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        
        self.title_label = QLabel("Select a story")
        self.title_label.setWordWrap(True)
        self.title_label.setStyleSheet("font-size: 22px; font-weight: bold; color: #2c3e50;")
        
        self.meta_label = QLabel("")
        self.meta_label.setStyleSheet("color: #7f8c8d; font-style: italic;")
        
        self.image_label = QLabel()
        self.image_label.setFixedSize(600, 300)
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setStyleSheet("background-color: #ecf0f1; border: 1px solid #bdc3c7;")
        
        self.content_view = QTextEdit()
        self.content_view.setReadOnly(True)
        self.content_view.setStyleSheet("font-size: 13px; line-height: 1.5;")
        
        content_layout.addWidget(self.title_label)
        content_layout.addWidget(self.meta_label)
        content_layout.addWidget(self.image_label)
        content_layout.addWidget(self.content_view)
        
        # Bottom half: Intelligence & Actions
        intel_widget = QWidget()
        intel_layout = QHBoxLayout(intel_widget)
        
        # Intelligence Panel
        self.intel_panel = QTextEdit()
        self.intel_panel.setReadOnly(True)
        self.intel_panel.setPlaceholderText("Intelligence results will appear here after processing.")
        self.intel_panel.setStyleSheet("background-color: #fdfefe; border: 1px dashed #7f8c8d;")
        
        # Action Buttons
        button_panel = QWidget()
        button_layout = QVBoxLayout(button_panel)
        
        self.accept_btn = QPushButton("Accept & Process")
        self.accept_btn.setStyleSheet("background-color: #2ecc71; color: white; padding: 15px; font-weight: bold;")
        self.accept_btn.clicked.connect(self.accept_story)
        
        self.reject_btn = QPushButton("Reject Story")
        self.reject_btn.setStyleSheet("background-color: #e74c3c; color: white; padding: 10px; font-weight: bold;")
        self.reject_btn.clicked.connect(self.reject_story)
        
        button_layout.addWidget(self.accept_btn)
        button_layout.addWidget(self.reject_btn)
        button_layout.addStretch()
        
        intel_layout.addWidget(self.intel_panel, 2)
        intel_layout.addWidget(button_panel, 1)
        
        detail_splitter.addWidget(content_widget)
        detail_splitter.addWidget(intel_widget)
        
        main_layout.addWidget(left_panel)
        main_layout.addWidget(detail_splitter)

    def load_stories(self):
        self.story_list.clear()
        status = self.status_filter.currentText()
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, source FROM stories WHERE status = ? ORDER BY created_at DESC", (status,))
        self.stories = cursor.fetchall()
        for s_id, title, source in self.stories:
            item = QListWidgetItem(f"[{source}] {title}")
            item.setData(Qt.ItemDataRole.UserRole, s_id)
            self.story_list.addItem(item)
        conn.close()
        
        # Toggle buttons based on status
        self.accept_btn.setVisible(status == 'staged')
        self.reject_btn.setVisible(status == 'staged')

    def display_story(self, index):
        if index < 0 or index >= len(self.stories):
            return
        
        story_id = self.story_list.item(index).data(Qt.ItemDataRole.UserRole)
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT title, source, author, published_date, lead_image_url, content_text, status FROM stories WHERE id = ?", (story_id,))
        story = cursor.fetchone()
        
        if story:
            title, source, author, date, img_url, content, status = story
            self.title_label.setText(title)
            self.meta_label.setText(f"By {author or 'Unknown'} | {source} | {date or 'No Date'}")
            self.content_view.setPlainText(content or "No content available.")
            
            # Load image
            if img_url:
                try:
                    resp = requests.get(img_url, timeout=5)
                    image = QImage()
                    image.loadFromData(resp.content)
                    pixmap = QPixmap.fromImage(image)
                    self.image_label.setPixmap(pixmap.scaled(600, 300, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
                except:
                    self.image_label.setText("Image failed to load")
            else:
                self.image_label.setText("No Image Available")

            # Load Intelligence if processed
            if status == 'processed':
                cursor.execute("SELECT entities, sentiment_score, jti_metrics FROM intelligence WHERE story_id = ?", (story_id,))
                intel = cursor.fetchone()
                if intel:
                    entities, sentiment, jti = intel
                    ents_list = json.loads(entities)
                    jti_dict = json.loads(jti)
                    
                    intel_text = f"<b>Sentiment:</b> {sentiment:.2f}<br><br>"
                    intel_text += "<b>JTI Metrics:</b><br>"
                    for k, v in jti_dict.items():
                        intel_text += f" - {k.replace('_', ' ').title()}: {v*100:.0f}%<br>"
                    
                    intel_text += "<br><b>Top Entities:</b><br>"
                    for e in ents_list[:15]:
                        intel_text += f" - {e['text']} ({e['label']})<br>"
                    
                    self.intel_panel.setHtml(intel_text)
                else:
                    self.intel_panel.setPlainText("Intelligence data missing.")
            else:
                self.intel_panel.clear()
        
        conn.close()

    def accept_story(self):
        current_item = self.story_list.currentItem()
        if not current_item:
            return
        
        story_id = current_item.data(Qt.ItemDataRole.UserRole)
        
        # Mark as accepted
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE stories SET status = 'accepted' WHERE id = ?", (story_id,))
        conn.commit()
        conn.close()
        
        # Trigger NLP
        process_story(story_id)
        
        QMessageBox.information(self, "Success", "Story accepted and intelligence pipeline complete.")
        self.load_stories()

    def reject_story(self):
        self.update_status('rejected')

    def update_status(self, status):
        current_item = self.story_list.currentItem()
        if not current_item:
            return
        
        story_id = current_item.data(Qt.ItemDataRole.UserRole)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE stories SET status = ? WHERE id = ?", (status, story_id))
        conn.commit()
        conn.close()
        
        QMessageBox.information(self, "Success", f"Story marked as {status}")
        self.load_stories()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MercuryGUI()
    window.show()
    sys.exit(app.exec())
