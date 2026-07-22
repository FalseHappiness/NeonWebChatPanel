import os
import sqlite3
from datetime import datetime, timezone
from typing import Dict, List, Optional, Union
import json


def _create_tables(conn: sqlite3.Connection):
    """创建数据库表结构"""
    conn.execute('''CREATE TABLE messages
                    (
                        id           INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id   INTEGER,
                        real_seq     INTEGER,
                        time         INTEGER,
                        self_id      INTEGER,
                        sender_id    INTEGER,
                        post_type    TEXT,
                        message_type TEXT,
                        notice_type  TEXT,
                        sub_type     TEXT,
                        group_id     INTEGER,
                        user_id      INTEGER,
                        operator_id  INTEGER,
                        target_id    INTEGER,
                        event        TEXT,
                        created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'))
                    )''')
    conn.commit()


def _check_and_update_schema(conn: sqlite3.Connection):
    """检查并更新数据库结构"""
    c = conn.cursor()

    # 检查messages表是否存在
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
    if not c.fetchone():
        _create_tables(conn)
        return

    # 检查所有必需的列是否存在
    c.execute("PRAGMA table_info(messages)")
    columns = {row[1] for row in c.fetchall()}
    required_columns = {
        'id', 'message_id', 'real_seq', 'time', 'self_id', 'sender_id', 'post_type',
        'message_type', 'notice_type', 'sub_type', 'group_id', 'user_id', 'operator_id',
        'target_id', 'event', 'created_at'
    }

    missing_columns = required_columns - columns
    if missing_columns:
        for column in missing_columns:
            # 根据列名确定类型
            if column == 'id':
                col_type = 'INTEGER PRIMARY KEY AUTOINCREMENT'
            elif column in {'message_id', 'real_seq', 'time', 'self_id', 'sender_id',
                            'group_id', 'user_id', 'operator_id', 'target_id'}:
                col_type = 'INTEGER'
            elif column == 'created_at':
                col_type = "TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'))"
            else:
                col_type = 'TEXT'

            try:
                conn.execute(f"ALTER TABLE messages ADD COLUMN {column} {col_type}")
            except sqlite3.OperationalError:
                # 如果添加列失败（例如列已存在但类型不同），尝试其他方式
                pass

        conn.commit()


class Database:
    def __init__(self, db_file: str):
        self.db_file = db_file
        self._ensure_db_integrity()

    def _ensure_db_integrity(self):
        """确保数据库存在且结构完整"""
        db_exists = os.path.exists(self.db_file)

        with sqlite3.connect(self.db_file) as conn:
            if not db_exists:
                # 全新数据库，创建完整结构
                _create_tables(conn)
            else:
                # 检查现有数据库结构
                _check_and_update_schema(conn)

    def _get_connection(self):
        return sqlite3.connect(self.db_file)

    def save_message(self, message_data: Dict) -> int:
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO messages
                         (message_id, real_seq, time, self_id, sender_id, post_type, message_type, notice_type,
                          sub_type,
                          group_id, user_id, operator_id, target_id, event, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (
                          message_data.get('message_id'),
                          message_data.get('real_seq'),
                          message_data.get('time'),
                          message_data.get('self_id'),
                          message_data.get('sender_id'),
                          message_data.get('post_type'),
                          message_data.get('message_type'),
                          message_data.get('notice_type'),
                          message_data.get('sub_type'),
                          message_data.get('group_id'),
                          message_data.get('user_id'),
                          message_data.get('operator_id'),
                          message_data.get('target_id'),
                          message_data.get('event'),
                          datetime.now(timezone.utc).isoformat()
                      )
                      )
            conn.commit()
            return c.lastrowid

    def get_msg(self, id, type='message_id'):
        """根据指定类型和ID从数据库查询消息

        Args:
            id: 要查询的消息ID值
            type: 查询类型，可以是'message_id'或'id'，默认为'message_id'

        Returns:
            返回匹配的消息记录字典，如果未找到则返回None
        """
        with self._get_connection() as conn:
            # 设置行工厂为字典形式
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # 验证type参数
            if type not in ('message_id', 'id'):
                raise ValueError("type参数必须是'message_id'或'id'")

            # print(type, id)

            # 执行参数化查询
            query = f"SELECT * FROM messages WHERE {type} = ? AND post_type IN ('message', 'message_sent')"
            cursor.execute(query, (id,))

            # 获取结果并转换为字典
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None

    def get_messages(
            self,
            limit: int = 100,
            cursor: Optional[int] = None,
            direction: str = "prev",
            include_cursor: bool = False,
            filters: Optional[Dict[str, Union[str, int, float, bool, List, None]]] | List[Dict] = None,
            use_real_seq: bool = False,  # 是否使用real_seq作为游标
            cursor_time: Optional[int] = None
    ) -> Dict[str, Union[int, List[Dict], None]]:
        """
        获取消息列表，使用游标分页（基于自增ID或real_seq）解决大数据量性能问题和数据变动问题

        :param limit: 返回记录数
        :param cursor: 游标ID（起始ID或real_seq）
        :param direction: 分页方向 "prev"（获取比游标旧的消息）或 "next"（获取比游标新的消息）
        :param include_cursor: 是否包含游标所在的消息
        :param filters: 筛选条件字典，键为字段名，值为筛选值或值列表
                       (只允许筛选预定义的字段)
                       可以传入包含多个筛选条件字典的列表，符合其中一个就可以筛选到
        :param use_real_seq: 是否使用real_seq作为游标字段（默认为False使用id）
        :param cursor_time: （use_real_seq为True时使用）以时间作为游标（最好使用real_seq和id，因为时间可能重复）
        :return: 包含max_id, min_id和消息列表的字典（当use_real_seq=True时，max_id/min_id对应real_seq）
        """
        # 定义允许筛选的安全字段及其类型
        ALLOWED_FILTER_FIELDS = {
            'message_id': int,
            'real_seq': int,
            'user_id': int,
            'self_id': int,
            'sender_id': int,
            'operator_id': int,
            'group_id': int,
            'target_id': int,
            'message_type': str,
            'notice_type': str,
            'sub_type': str,
            'created_at': str,
            'raw_message': str
        }

        result = {
            "max_id": -1,
            "min_id": -1,
            "messages": []
        }

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()

            # 构建基础查询和筛选条件
            base_query = 'SELECT * FROM messages'
            # 根据是否使用real_seq决定统计字段
            id_field = 'real_seq' if use_real_seq else 'id'
            count_query = f'SELECT MIN({id_field}) as min_id, MAX({id_field}) as max_id FROM messages'
            params = []
            filter_conditions = []

            # 添加筛选条件
            if filters:
                # 将单个字典转换为列表形式统一处理
                filter_list = filters if isinstance(filters, list) else [filters]
                or_conditions = []

                for filter_dict in filter_list:
                    and_conditions = []
                    for field, value in filter_dict.items():
                        # 检查字段是否允许筛选
                        if field not in ALLOWED_FILTER_FIELDS:
                            continue

                        # 处理多值情况
                        if isinstance(value, (list, tuple, set)):
                            expected_type = ALLOWED_FILTER_FIELDS[field]
                            valid_values = []
                            for v in value:
                                try:
                                    if v is None:  # 允许空值
                                        valid_values.append(v)
                                        continue
                                    if not isinstance(v, expected_type):
                                        v = expected_type(v)
                                    valid_values.append(v)
                                except (ValueError, TypeError):
                                    continue

                            if valid_values:
                                # 处理包含NULL的情况
                                null_condition = f"{field} IS NULL" if None in valid_values else ""
                                non_null_values = [v for v in valid_values if v is not None]

                                conditions = []
                                if non_null_values:
                                    placeholders = ', '.join(['?'] * len(non_null_values))
                                    conditions.append(f"{field} IN ({placeholders})")
                                if null_condition:
                                    conditions.append(null_condition)

                                if conditions:
                                    and_conditions.append(
                                        f"( {' OR '.join(conditions)} )" if len(conditions) > 1 else conditions[0]
                                    )
                                    params.extend(non_null_values)
                        else:
                            # 单值情况
                            expected_type = ALLOWED_FILTER_FIELDS[field]
                            try:
                                if value is None:
                                    and_conditions.append(f"{field} IS NULL")
                                else:
                                    if not isinstance(value, expected_type):
                                        value = expected_type(value)
                                    and_conditions.append(f"{field} = ?")
                                    params.append(value)
                            except (ValueError, TypeError):
                                continue

                    if and_conditions:
                        or_conditions.append(f"( {' AND '.join(and_conditions)} )")

                if or_conditions:
                    if len(or_conditions) > 1:
                        filter_conditions.append(f"( {' OR '.join(or_conditions)} )")
                    else:
                        filter_conditions.append(or_conditions[0])

            # 获取当前筛选条件下的最大最小ID
            if filter_conditions:
                where_clause = ' WHERE ' + ' AND '.join(filter_conditions)
                count_query += where_clause

            # conn.set_trace_callback(print)

            c.execute(count_query, params)
            id_range = c.fetchone()
            min_id = id_range['min_id'] if id_range['min_id'] is not None else -1
            max_id = id_range['max_id'] if id_range['max_id'] is not None else -1

            # 如果没有数据，直接返回
            if min_id == -1 or max_id == -1:
                return result

            result['min_id'] = min_id
            result['max_id'] = max_id

            # 处理游标逻辑
            if cursor is None:
                cursor = max_id if direction == "prev" else min_id

            # 构建主查询
            query = base_query
            if filter_conditions:
                query += ' WHERE ' + ' AND '.join(filter_conditions)

            # 添加游标条件
            cursor_params = []
            if direction == "prev":
                if include_cursor:
                    cursor_calculation_symbol = '<='
                else:
                    cursor_calculation_symbol = '<'
                order = "DESC"
            else:  # next
                if include_cursor:
                    cursor_calculation_symbol = '>='
                else:
                    cursor_calculation_symbol = '>'
                order = "ASC"

            if filter_conditions:
                query += ' AND '
            else:
                query += ' WHERE '

            if use_real_seq and cursor_time:
                query += f"( time {cursor_calculation_symbol} ? OR {id_field} {cursor_calculation_symbol} ? )"
                cursor_params.extend([cursor_time, cursor])
            else:
                query += f"{id_field} {cursor_calculation_symbol} ?"
                cursor_params.append(cursor)

            # 添加排序和分页
            query += f' ORDER BY id {order} LIMIT ?'
            cursor_params.append(limit)
            params.extend(cursor_params)

            # 执行查询
            c.execute(query, params)
            rows = c.fetchall()
            messages = [dict(row) for row in rows]

            # 如果是prev方向且降序查询，需要反转结果以保持时间顺序
            if direction == "prev":
                messages.reverse()

            result['messages'] = messages
            return result

    def get_contacts(self) -> List[Dict]:
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            # 获取所有联系人（群组和私聊）以及最大最小消息ID
            c.execute('''
                      WITH all_contacts AS (
                          -- 私聊联系人（基于target_id或user_id）
                          SELECT CASE
                                     WHEN post_type = 'notice' THEN user_id
                                     ELSE target_id
                                     END                                  AS contact_id,
                                 'private'                                AS type,
                                 json_extract(event, '$.sender.nickname') AS name,
                                 MAX(created_at)                          AS last_time,
                                 MAX(time)                                AS last_timestamp,
                                 event                                    AS latest_msg
                          FROM messages
                          WHERE (
                                    -- 第一种私聊消息条件
                                    (target_id IS NOT NULL AND target_id != 0 AND sub_type = 'friend' AND
                                     post_type IN ('message', 'message_sent'))
                                        OR
                                        -- 第二种私聊消息条件
                                    (user_id IS NOT NULL AND user_id != 0 AND group_id IS NULL AND sub_type = 'poke' AND
                                     notice_type = 'notify' AND post_type = 'notice')
                                    )
                          GROUP BY contact_id, type

                          UNION ALL

                          -- 群聊联系人（基于group_id）
                          SELECT group_id                            AS contact_id,
                                 'group'                             AS type,
                                 json_extract(event, '$.group_name') AS name,
                                 MAX(created_at)                     AS last_time,
                                 MAX(time)                           AS last_timestamp,
                                 event                               AS latest_msg
                          FROM messages
                          WHERE (
                                    -- 第一种群聊消息条件
                                    (group_id IS NOT NULL AND group_id != 0 AND sub_type = 'normal' AND
                                     post_type IN ('message', 'message_sent'))
                                        OR
                                        -- 第二种群聊消息条件
                                    (group_id IS NOT NULL AND group_id != 0 AND
                                     sub_type IN ('poke', 'add', 'ban', 'lift_ban', 'approve', 'invite', 'kick_me', 'remove') AND
                                     notice_type IN ('notify', 'essence', 'group_ban', 'group_increase', 'group_decrease', 'group_msg_emoji_like') AND
                                     post_type = 'notice')
                                    )
                          GROUP BY contact_id, type)

                      -- 最终结果，按最后时间降序排列
                      SELECT contact_id,
                             type,
                             name,
                             last_time,
                             last_timestamp,
                             latest_msg
                      FROM all_contacts
                      WHERE contact_id IS NOT NULL
                        AND contact_id != 0
                      ORDER BY last_time DESC;
                      ''')
            rows = c.fetchall()  # 获取所有行数据

            result_list = []
            for row in rows:
                row_dict = dict(row)
                result_list.append(row_dict)

            return result_list

    def get_new_messages(self, last_received_id: int = 0) -> List[Dict]:
        """
        获取比指定ID更新的消息
        :param last_received_id: 客户端最后收到的消息ID
        :return: 新消息列表
        """
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute('''
                      SELECT *
                      FROM messages
                      WHERE id > ?
                      ORDER BY id ASC
                      ''', (last_received_id,))
            return [dict(row) for row in c.fetchall()]

    def process_recall_event(self, event: Dict) -> Optional[Dict]:
        """
        处理撤回事件，更新原始消息的event字段添加recall_operator信息

        Args:
            event: 撤回事件的字典数据，必须包含:
                   - notice_type: 'group_recall' 或 'friend_recall'
                   - message_id: 被撤回的消息ID
                   - operator_id: (group_recall时使用)
                   - user_id: (friend_recall时使用)

        Returns:
            更新后的原始消息字典，如果未找到则返回None
        """
        # 验证是否为撤回事件
        if event.get('post_type') != 'notice' or event.get('notice_type') not in ('group_recall', 'friend_recall'):
            return None

        message_id = event.get('message_id')
        if not message_id:
            return None

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # 查找原始消息
            cursor.execute('''
                           SELECT *
                           FROM messages
                           WHERE message_id = ?
                             AND post_type IN ('message', 'message_sent')
                           ''', (message_id,))

            original_msg = cursor.fetchone()
            if not original_msg:
                return None

            original_msg = dict(original_msg)
            original_event = json.loads(original_msg['event']) if isinstance(original_msg['event'], str) else \
                original_msg['event']

            # 设置recall_operator
            if event['notice_type'] == 'group_recall':
                recall_operator = event.get('operator_id')
            else:  # friend_recall
                recall_operator = event.get('user_id')

            # 更新event字段
            original_event['recall_operator'] = recall_operator
            updated_event = json.dumps(original_event, ensure_ascii=False)

            # 更新数据库
            cursor.execute('''
                           UPDATE messages
                           SET event = ?
                           WHERE id = ?
                           ''', (updated_event, original_msg['id']))

            conn.commit()

            # 返回更新后的消息
            original_msg['event'] = original_event
            return original_msg

    def get_nearest_message_to_notice(self, notice_id, group_id=None, target_id=None, get_before=True, get_after=True):
        """
        获取与指定通知消息最接近的前后消息

        Args:
            notice_id: 通知消息的ID
            group_id: 可选的群组ID筛选条件
            target_id: 可选的目标ID筛选条件
            get_before: 是否获取id较小的前一条消息
            get_after: 是否获取id较大的后一条消息
        Returns:
            根据参数返回dict或单个消息:
                - 当同时获取前后消息时: {'before':行或None, 'after':行或None}
                - 当只获取前或后消息时: 直接返回行或None
        """
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()

            # 查询条件参数
            conditions = [
                "(post_type = 'message' OR post_type = 'message_sent')",
                "(message_type = 'group' OR post_type = 'private')",
                "(sub_type = 'normal' OR sub_type = 'friend' OR sub_type = 'group')"
            ]
            params = [notice_id]

            if group_id is not None:
                conditions.append("group_id = ?")
                params.append(group_id)

            if target_id is not None:
                conditions.append("target_id = ?")
                params.append(target_id)

            where_clause = " AND ".join(conditions)
            result = {}

            if get_before:
                c.execute(f"""
                    SELECT * FROM messages 
                    WHERE id < ? AND {where_clause}
                    ORDER BY id DESC
                    LIMIT 1
                """, params)
                before_msg = c.fetchone()
                result['before'] = dict(before_msg) if before_msg else None

            if get_after:
                c.execute(f"""
                    SELECT * FROM messages 
                    WHERE id > ? AND {where_clause}
                    ORDER BY id ASC
                    LIMIT 1
                """, params)
                after_msg = c.fetchone()
                result['after'] = dict(after_msg) if after_msg else None

            # 如果只需要一个结果，直接返回该结果而不是字典
            if not get_before and get_after:
                return result.get('after')
            elif get_before and not get_after:
                return result.get('before')

            return result

    def clear_messages(self):
        with self._get_connection() as conn:
            conn.execute('DELETE FROM messages')
            conn.commit()
