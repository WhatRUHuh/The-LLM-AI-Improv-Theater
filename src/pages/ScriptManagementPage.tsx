import React, { useState, useEffect } from 'react';
// 导入 theme 用于获取背景色等 token
import { Table, Button, message, Popconfirm, Tag, theme } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Script, AICharacter } from '../types';
import { scriptLogger as logger } from '../utils/logger'; // 导入日志工具

// columns 的 handleDelete 现在需要传入剧本 ID
const columns = (
  characters: AICharacter[], // 仍然需要角色列表来显示名字
  handleDelete: (id: string) => void, // <-- 确认接收 id
  navigateToEdit: (id: string) => void
) => [
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
  },
  {
    title: '场景',
    dataIndex: 'scene',
    key: 'scene',
    ellipsis: true,
  },
  {
    title: '角色',
    dataIndex: 'characterIds',
    key: 'characterIds',
    render: (characterIds: string[] | undefined) => {
      if (!characterIds || characterIds.length === 0) return '-';
      const characterNames = characterIds.map(id => {
        const character = characters.find(r => r.id === id);
        return character ? character.name : `未知ID(${id.substring(0, 4)}...)`;
      }).slice(0, 3);

      return (
        <>
          {characterNames.map(name => (
            <Tag key={name}>{name}</Tag>
          ))}
          {characterIds.length > 3 && <Tag>...</Tag>}
        </>
      );
    },
  },
  {
    title: '操作',
    key: 'action',
    render: (_: unknown, record: Script) => (
      <span>
        <Button type="link" onClick={() => navigateToEdit(record.id)}>编辑</Button>
        <Popconfirm
          title={`确定删除剧本 "${record.title}" 吗？`}
          onConfirm={() => handleDelete(record.id)} // <-- 确认传入 id
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger>删除</Button>
        </Popconfirm>
      </span>
    ),
  },
];

const ScriptManagementPage: React.FC = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [allCharacters, setAllCharacters] = useState<AICharacter[]>([]);
  const navigate = useNavigate();
  // 获取 antd 主题 token
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  // 加载所有角色数据 - 使用新的 listCharacters API
  const loadAllCharacters = async () => {
    logger.info('加载所有角色...');
    setLoadingCharacters(true);
    try {
      const result = await window.electronAPI.listCharacters();
      if (result.success && Array.isArray(result.data)) {
        logger.info(`已加载角色: ${result.data.length}个`);
        setAllCharacters(result.data);
      } else {
        message.error(`加载角色列表失败: ${result.error || '未知错误'}`);
        setAllCharacters([]);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 listCharacters 时出错: ${errorMsg}`);
      setAllCharacters([]);
    } finally {
      setLoadingCharacters(false);
    }
  };

  // 加载剧本数据 - 使用新的 listScripts API
  const loadScripts = async () => {
    logger.info('加载剧本...');
    setLoadingScripts(true);
    try {
      const result = await window.electronAPI.listScripts();
      if (result.success && Array.isArray(result.data)) {
         logger.info(`已加载剧本: ${result.data.length}个`);
        setScripts(result.data);
      } else {
        message.error(`加载剧本列表失败: ${result.error || '未知错误'}`);
        setScripts([]);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 listScripts 时出错: ${errorMsg}`);
      setScripts([]);
    } finally {
      setLoadingScripts(false);
    }
  };

  // 组件加载时读取剧本和角色数据
  useEffect(() => {
    loadScripts();
    loadAllCharacters();
  }, []);

  // 跳转到添加页面
  const navigateToAdd = () => {
    navigate('/scripts/add');
  };

  // 跳转到编辑页面
  const navigateToEdit = (id: string) => {
    navigate(`/scripts/edit/${id}`);
  };

  // 处理删除 - 使用新的 deleteScript API，传入剧本 ID
  const handleDelete = async (id: string) => { // <-- 改回接收 id
    const scriptToDelete = scripts.find(s => s.id === id); // 找到剧本用于显示标题
    const scriptTitle = scriptToDelete ? scriptToDelete.title : `ID: ${id}`;
    logger.info(`尝试删除剧本: ${scriptTitle} (ID: ${id})`);
    try {
      const result = await window.electronAPI.deleteScript(id); // <-- 传递 id
      if (result.success) {
        message.success(`剧本 "${scriptTitle}" 已删除`);
        // 删除成功后重新加载列表
        loadScripts();
      } else {
        message.error(`删除剧本 "${scriptTitle}" 失败: ${result.error || '未知错误'}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 deleteScript 时出错: ${errorMsg}`);
    }
  };

  return (
    // 1. 添加外部 div，负责滚动和左侧 5px 灰色边距
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
      {/* 2. 给内部容器加上背景、圆角和内边距 */}
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, padding: 10 }}>
        <Button type="primary" onClick={navigateToAdd} style={{ marginBottom: 16 }}>
          添加剧本
      </Button>
      <Table
        columns={columns(allCharacters, handleDelete, navigateToEdit)}
        dataSource={scripts}
        loading={loadingScripts || loadingCharacters} // 任何一个在加载都显示 loading
        rowKey="id"
        pagination={false}
      />
      </div>
    </div> // 闭合外部 div
  );
};

export default ScriptManagementPage;