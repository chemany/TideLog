# backend/python_scripts/qq_ews_sync.py

import sys
import json
import logging
from datetime import datetime, date
from exchangelib import DELEGATE, Account, Credentials, Configuration, CalendarItem, Q, FaultTolerance
from exchangelib.errors import UnauthorizedError, ErrorNonExistentMailbox, RateLimitError, TransportError, ErrorFolderNotFound
from exchangelib.ewsdatetime import EWSDateTime, EWSTimeZone
from exchangelib.errors import EWSWarning
from exchangelib.version import Version, EXCHANGE_2013 # 导入版本类

# --- 配置日志 --- 
def setup_logging():
    """设置日志记录器，将错误输出到 stderr。"""
    log_format = '%(asctime)s - [%(levelname)s] - (%(filename)s:%(lineno)d) - %(message)s'
    logging.basicConfig(level=logging.INFO, format=log_format, stream=sys.stderr) # 输出到 stderr
    # 可以根据需要调整级别为 logging.DEBUG

# --- 主要同步函数 --- 
def sync_qq_calendar(email, password, start_date_str, end_date_str):
    """连接 QQ EWS，获取指定日期范围内的日历事件。"""
    logging.info(f"Starting QQ EWS sync for {email}")
    events = []
    error_message = None

    try:
        # 1. 解析日期
        try:
            start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            logging.info(f"Syncing events from {start_date.isoformat()} to {end_date.isoformat()}")
        except ValueError as e:
            raise ValueError(f"Invalid date format received: {e}") from e

        # 2. 配置凭据和服务器
        credentials = Credentials(email, password)
        
        # 显式指定 API 版本
        ews_version = Version(build=EXCHANGE_2013) # 创建版本对象

        # QQ EWS 服务器地址 - 显式指定完整端点和版本
        config = Configuration(
            service_endpoint='https://ex.qq.com/EWS/Exchange.asmx',
            credentials=credentials,
            auth_type='basic',
            version=ews_version, # <-- 在 Configuration 中指定版本
            retry_policy=FaultTolerance(max_wait=30)
        )

        # 3. 创建账户对象
        # 使用 DELEGATE 访问类型
        # 关闭 Autodiscover
        account = Account(
            primary_smtp_address=email,
            config=config,
            autodiscover=False,
            access_type=DELEGATE
        )
        logging.info(f"Account object created (Version specified in config: {ews_version.api_version}). Accessing inbox...")

        # --- 测试邮件读取逻辑 --- 
        email_subjects = []
        mail_error = None
        try:
            # 4. 访问收件箱
            inbox = account.inbox
            logging.info(f"Accessed inbox folder: '{inbox.name}'")

            # 5. 获取最新的5封邮件
            logging.info("Fetching latest 5 emails...")
            latest_emails = inbox.all().order_by('-datetime_received')[:5]

            item_count = 0
            for item in latest_emails:
                item_count += 1
                if item.subject:
                    email_subjects.append(item.subject)
                else:
                    email_subjects.append("(No Subject)")
            logging.info(f"Successfully fetched {len(email_subjects)} email subjects.")

        except ErrorFolderNotFound:
            mail_error = "Could not find the Inbox folder."
            logging.error(mail_error)
        except Exception as mail_exc:
            # 捕获其他可能的邮件读取错误
            mail_error = f"Error accessing emails: {mail_exc}"
            logging.error(mail_error, exc_info=True)
        # --- 结束测试邮件读取逻辑 ---

        # --- 注释掉原来的日历处理逻辑 --- 
        # # 4. 获取日历文件夹 (尝试获取默认日历)
        # calendar_folder = None
        # try:
        #     # 优先尝试中文名称
        #     calendar_folder = account.root.get_folder_by_name('日历')
        #     logging.info(f"Found calendar folder by name: '日历'")
        # except ErrorFolderNotFound:
        #     logging.warning("Could not find calendar folder named '日历'. Trying 'Calendar'...")
        #     try:
        #         # 回退到英文名称
        #         calendar_folder = account.root.get_folder_by_name('Calendar')
        #         logging.info(f"Found calendar folder by name: 'Calendar'")
        #     except ErrorFolderNotFound:
        #         logging.error("Could not find calendar folder by name '日历' or 'Calendar'.")
        #         # 保留之前的 ValueError，因为这是配置/账户问题
        #         raise ValueError("Could not find the primary calendar folder by known names ('日历' or 'Calendar'). Check folder name or permissions.")

        # if not calendar_folder:
        #      # 如果上面的逻辑都没找到文件夹 (理论上不应该到这里)
        #      raise ValueError("Could not access the default calendar folder after searching by name.")
             
        # logging.info(f"Accessed calendar folder: '{calendar_folder.name}'")

        # # 5. 定义查询过滤器 (时间范围)
        # # 使用 EWSDateTime 包装日期，并指定 UTC 时区
        # tz = EWSTimeZone.timezone('UTC')
        # ews_start = tz.localize(EWSDateTime.from_datetime(start_date))
        # ews_end = tz.localize(EWSDateTime.from_datetime(end_date))

        # calendar_filter = (
        #     (Q(start__range=(ews_start, ews_end))) |
        #     (Q(end__range=(ews_start, ews_end))) |
        #     (Q(start__lt=ews_start) & Q(end__gt=ews_end))
        # )
        # logging.info("Fetching calendar items...")

        # # 6. 获取日历项
        # fetched_items = calendar_folder.filter(calendar_filter).only(
        #     'item_id', 'subject', 'start', 'end', 'body', 'location',
        #     'is_all_day', 'datetime_created', 'last_modified_time'
        # ).order_by('start')

        # item_count = 0
        # for item in fetched_items:
        #     item_count += 1
        #     if not isinstance(item, CalendarItem):
        #         logging.warning(f"Skipping non-calendar item: {type(item)}")
        #         continue

        #     # 7. 格式化事件数据
        #     try:
        #         utc_tz = EWSTimeZone.timezone('UTC')
        #         start_dt = item.start.astimezone(utc_tz).replace(tzinfo=None) if item.start else None
        #         end_dt = item.end.astimezone(utc_tz).replace(tzinfo=None) if item.end else None
        #         created_dt = item.datetime_created.astimezone(utc_tz).replace(tzinfo=None) if item.datetime_created else None
        #         modified_dt = item.last_modified_time.astimezone(utc_tz).replace(tzinfo=None) if item.last_modified_time else None

        #         event_data = {
        #             "id": item.item_id.id,
        #             "exchange_id": item.item_id.id,
        #             "change_key": item.item_id.changekey,
        #             "title": item.subject if item.subject else "无标题事件",
        #             "start_datetime": start_dt.isoformat() + 'Z' if start_dt else None,
        #             "end_datetime": end_dt.isoformat() + 'Z' if end_dt else None,
        #             "description": item.body if item.body else "",
        #             "location": item.location if item.location else "",
        #             "all_day": item.is_all_day if item.is_all_day is not None else False,
        #             "source": "qq_ews_python_sync",
        #             "created_at": created_dt.isoformat() + 'Z' if created_dt else None,
        #             "updated_at": modified_dt.isoformat() + 'Z' if modified_dt else datetime.utcnow().isoformat() + 'Z',
        #             "needs_caldav_push": False,
        #             "caldav_uid": None,
        #             "caldav_etag": None
        #         }
        #         events.append(event_data)
        #     except Exception as format_exc:
        #         logging.error(f"Error formatting item ID {item.item_id.id}: {format_exc}", exc_info=True)
        
        # logging.info(f"Successfully fetched and processed {len(events)} calendar items (out of {item_count} raw items).")
        # --- 结束注释日历逻辑 ---

    except UnauthorizedError:
        error_message = "QQ EWS Authentication failed. Check email and password/app-code."
        logging.error(error_message)
    except ErrorNonExistentMailbox:
         error_message = f"QQ EWS mailbox not found for {email}. Check the email address."
         logging.error(error_message)
    except TransportError as e:
        error_message = f"QQ EWS connection error: {e}"
        logging.error(error_message)
    except RateLimitError:
        error_message = "QQ EWS rate limit exceeded. Try again later."
        logging.error(error_message)
    except ValueError as e:
        error_message = f"Configuration or data error: {e}"
        logging.error(error_message)
    except Exception as e:
        error_message = f"An unexpected error occurred during QQ EWS sync: {e}"
        logging.error(error_message, exc_info=True)

    # 8. 准备输出结果 (包含邮件测试信息)
    output = {
        "success": error_message is None and mail_error is None, # 成功条件：没有主错误且没有邮件错误
        "email": email,
        "events": [], # 暂时不返回事件
        "error": error_message or mail_error, # 返回第一个遇到的错误
        "email_subjects_test": email_subjects if mail_error is None else None # 包含邮件主题测试结果
    }
    return json.dumps(output, indent=2) # 返回 JSON 字符串

# --- 主执行块 --- 
if __name__ == "__main__":
    setup_logging()
    logging.info("QQ EWS Sync Script Started.")
    
    # --- 从标准输入读取凭据和日期 --- 
    input_data = None
    try:
        input_json = sys.stdin.read()
        input_data = json.loads(input_json)
        logging.info("Read input from stdin.")
    except json.JSONDecodeError:
        logging.error("Failed to decode JSON from stdin.")
        print(json.dumps({"success": False, "error": "Invalid JSON input from stdin."}))
        sys.exit(1)
    except Exception as e:
        logging.error(f"Error reading from stdin: {e}")
        print(json.dumps({"success": False, "error": f"Error reading stdin: {e}"}))
        sys.exit(1)

    if not input_data or not all(k in input_data for k in ('email', 'password', 'startDate', 'endDate')):
        logging.error("Missing required fields in stdin JSON (email, password, startDate, endDate).")
        print(json.dumps({"success": False, "error": "Missing required fields in stdin JSON."}))
        sys.exit(1)
        
    # 调用同步函数
    result_json = sync_qq_calendar(
        input_data['email'], 
        input_data['password'], 
        input_data['startDate'], 
        input_data['endDate']
    )
    
    # 将结果输出到 stdout
    print(result_json)
    logging.info("QQ EWS Sync Script Finished.") 