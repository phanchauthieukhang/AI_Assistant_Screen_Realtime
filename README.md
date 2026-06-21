# AI Screen Reader & Realtime Assistant

Phần mềm chụp và đọc màn hình thời gian thực sử dụng các mô hình AI tiên tiến (Gemini, GPT-4o, Claude 3.5) để tự động trả lời các câu hỏi xuất hiện trên màn hình học tập (như Quizziz, Azota, Kahoot, Forms, v.v.). Đáp án được hiển thị trên cửa sổ overlay bán trong suốt đè lên màn hình.

## Tính năng chính

- **Chụp màn hình thông minh:** Chụp toàn bộ màn hình hoặc vùng chọn được chỉ định (như Snipping Tool).
- **Hỗ trợ đa mô hình AI:** Gemini (1.5 Flash - nhanh & rẻ), GPT-4o (mạnh mẽ) và Claude 3.5 Sonnet (tư duy logic).
- **Overlay trong suốt hiện đại:** Cửa sổ bán trong suốt có thể di chuyển, co giãn, thu nhỏ thành thanh tiêu đề, đổi chế độ sáng/tối.
- **Tài liệu tham khảo (Tối đa 50MB):** Nạp trước tài liệu PDF, DOCX, TXT hoặc hình ảnh tham khảo. AI sẽ tự động OCR và ưu tiên câu trả lời dựa trên nội dung nguồn này.
- **Smart Change Detection:** Chỉ gửi request tới AI khi nội dung màn hình thay đổi thực sự (tránh trùng lặp và tiết kiệm chi phí).
- **Lịch sử phiên:** Lưu lại lịch sử các câu trả lời hiển thị trực tiếp trong bảng điều khiển.

## Hệ thống Phím tắt Toàn cục (Global Hotkeys)

Bạn có thể điều khiển ứng dụng khi đang ở trên bất kỳ trình duyệt hay game nào:

- `Ctrl + Shift + S`: Chụp màn hình và trả lời ngay lập tức.
- `Ctrl + Shift + A`: Bật / Tắt chế độ chụp tự động.
- `Ctrl + Shift + H`: Ẩn / Hiện nhanh cửa sổ hiển thị overlay.
- `Ctrl + Shift + R`: Mở khung kéo vẽ vùng chọn chụp màn hình mới.

## Cài đặt & Chạy ứng dụng

1. Đảm bảo máy tính đã cài đặt [Node.js](https://nodejs.org/).
2. Tải mã nguồn về máy.
3. Cài đặt các thư viện phụ thuộc:

   ```bash
   npm install
   ```

4. Khởi chạy ứng dụng:

   ```bash
   npm start
   ```

## Hướng dẫn Sử dụng

1. Khởi chạy ứng dụng bằng lệnh `npm start`. Cửa sổ bảng điều khiển sẽ xuất hiện.
2. Tại tab **Cấu hình AI**:
   - Chọn AI Model bạn muốn sử dụng.
   - Điền API Key tương ứng (Gemini API Key, OpenAI API Key hoặc Claude API Key) và nhấn **Lưu cấu hình AI**.
3. Tại tab **Tài liệu tham khảo** (Không bắt buộc):
   - Kéo thả các tài liệu hỗ trợ học tập (PDF, DOCX, TXT hoặc Ảnh chụp bài giảng) để AI ưu tiên phân tích.
4. Tại tab **Cấu hình & Phím tắt**:
   - Chọn chế độ chụp mặc định: Toàn màn hình hoặc Vùng chọn.
   - Nếu chọn vùng chụp, hãy nhấp vào **Chọn vùng chụp** (hoặc dùng `Ctrl+Shift+R`) để kéo một khung chữ nhật bao quanh khu vực hiển thị câu hỏi.
5. Nhấp nút **Bắt đầu Phiên** ở góc trên cùng bên phải bảng điều khiển. Cửa sổ hiển thị overlay bán trong suốt sẽ xuất hiện.
6. Sử dụng hotkey `Ctrl+Shift+S` để chụp thủ công hoặc bật chế độ tự động bằng nút **Tự động: TẮT** (hoặc `Ctrl+Shift+A`).
