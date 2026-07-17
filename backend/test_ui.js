const { Builder, By, until } = require('selenium-webdriver');
const xlsx = require('xlsx');

const FRONTEND_URL = 'http://localhost:5173';

const testCases = [
  {
    id: 'TC002',
    desc: 'Sai password',
    expected: 'Thông báo sai mật khẩu',
    execute: async (driver) => {
      await driver.get(FRONTEND_URL);
      const userBox = await driver.wait(until.elementLocated(By.css('input[placeholder="vd: admin"]')), 5000);
      const passBox = await driver.findElement(By.css('input[type="password"]'));
      const btn = await driver.findElement(By.css('button.btn-primary'));

      await userBox.sendKeys('admin');
      await passBox.sendKeys('wrongpassword');
      await btn.click();

      // Check for error message
      try {
        const errorDiv = await driver.wait(until.elementLocated(By.css('div.text-rose-600')), 3000);
        const text = await errorDiv.getText();
        return { pass: text.includes('sai') || text.includes('thất bại') || text.includes('không hợp lệ'), actual: text };
      } catch (e) {
        return { pass: false, actual: 'Không hiện thông báo lỗi' };
      }
    }
  },
  {
    id: 'TC006',
    desc: "SQL Injection: ' OR 1=1 --",
    expected: 'Không đăng nhập',
    execute: async (driver) => {
      await driver.get(FRONTEND_URL);
      const userBox = await driver.wait(until.elementLocated(By.css('input[placeholder="vd: admin"]')), 5000);
      const passBox = await driver.findElement(By.css('input[type="password"]'));
      const btn = await driver.findElement(By.css('button.btn-primary'));

      await userBox.sendKeys("' OR 1=1 --");
      await passBox.sendKeys("123");
      await btn.click();

      try {
        const errorDiv = await driver.wait(until.elementLocated(By.css('div.text-rose-600')), 3000);
        return { pass: true, actual: await errorDiv.getText() };
      } catch (e) {
        return { pass: false, actual: 'Đăng nhập thành công, có lỗ hổng SQLi' };
      }
    }
  },
  {
    id: 'TC001',
    desc: 'Login đúng username/password',
    expected: 'Đăng nhập thành công',
    execute: async (driver) => {
      await driver.get(FRONTEND_URL);
      const userBox = await driver.wait(until.elementLocated(By.css('input[placeholder="vd: admin"]')), 5000);
      const passBox = await driver.findElement(By.css('input[type="password"]'));
      const btn = await driver.findElement(By.css('button.btn-primary'));

      await userBox.sendKeys('admin');
      await passBox.sendKeys('admin123');
      await btn.click();

      // Wait until we see sidebar or dashboard
      try {
        const sidebarText = await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Hệ thống MES')]")), 5000);
        return { pass: true, actual: 'Truy cập thành công vào Dashboard' };
      } catch (e) {
        return { pass: false, actual: 'Không vào được Dashboard' };
      }
    }
  }
];

async function runSeleniumTests() {
  console.log("Khởi động Selenium Chrome WebDriver...");
  let driver = await new Builder().forBrowser('chrome').build();
  
  const results = [];
  try {
    for (const tc of testCases) {
      console.log(`Đang chạy: [${tc.id}] ${tc.desc}...`);
      try {
        const res = await tc.execute(driver);
        results.push({
          'Mã Testcase': tc.id,
          'Mục đích': tc.desc,
          'Kết quả mong muốn': tc.expected,
          'Kết quả thực tế': res.actual,
          'Trạng thái': res.pass ? 'Pass' : 'Fail'
        });
        console.log(` => ${res.pass ? 'PASS' : 'FAIL'} (${res.actual})`);
      } catch (err) {
        results.push({
          'Mã Testcase': tc.id,
          'Mục đích': tc.desc,
          'Kết quả mong muốn': tc.expected,
          'Kết quả thực tế': 'Lỗi Script: ' + err.message,
          'Trạng thái': 'Error'
        });
        console.log(` => ERROR (${err.message})`);
      }
    }
  } finally {
    await driver.quit();
  }

  const workbook = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(results);
  xlsx.utils.book_append_sheet(workbook, ws, 'UI Authentication');

  const outPath = 'e:\\Project_MES\\Selenium_TestReport.xlsx';
  xlsx.writeFile(workbook, outPath);
  console.log(`\n=> Báo cáo Selenium đã lưu tại: ${outPath}`);
}

runSeleniumTests().catch(console.error);
