import { getValuesByPath } from '@nocobase/utils/client';
import _ from 'lodash';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAPIClient } from '../api-client';
import type { CollectionFieldOptions } from '../collection-manager';
import { useCollectionManager } from '../collection-manager';
import { useCompile } from '../schema-component';
import { REGEX_OF_VARIABLE, isVariable } from '../schema-component/common/utils/uitls';
import useBuiltInVariables from './hooks/useBuiltinVariables';
import { VariableOption, VariablesContextType } from './types';

export const VariablesContext = createContext<VariablesContextType>(null);

const variableToCollectionName = {};

const TYPE_TO_ACTION = {
  hasMany: 'list',
  belongsTo: 'get',
  hasOne: 'get',
  belongsToMany: 'list',
};

const getAction = (type: string) => {
  if (process.env.NODE_ENV !== 'production' && !(type in TYPE_TO_ACTION)) {
    throw new Error(`VariablesProvider: unknown type: ${type}`);
  }

  return TYPE_TO_ACTION[type];
};

const getFieldPath = (variablePath: string) => {
  const list = variablePath.split('.');
  const result = list.map((item) => {
    if (variableToCollectionName[item]) {
      return variableToCollectionName[item];
    }
    return item;
  });
  return result.join('.');
};

/**
 * `{{ $user.name }}` => `$user.name`
 * @param variableString
 * @returns
 */
export const getPath = (variableString: string) => {
  if (!variableString) {
    return variableString;
  }

  const matches = variableString.match(REGEX_OF_VARIABLE);
  return matches[0].replace(REGEX_OF_VARIABLE, '$1');
};

const VariablesProvider = ({ children }) => {
  const ctxRef = useRef<Record<string, any>>({});
  const [ctx, setCtx] = useState<Record<string, any>>({});
  const api = useAPIClient();
  const { getCollectionJoinField } = useCollectionManager();
  const compile = useCompile();
  const { builtinVariables } = useBuiltInVariables();

  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  /**
   * 1. 从 `ctx` 中根据 `path` 取值
   * 2. 如果某个 `key` 不存在，且 `key` 是一个关联字段，则从 api 中获取数据，并缓存到 `ctx` 中
   * 3. 如果某个 `key` 不存在，且 `key` 不是一个关联字段，则返回当前值
   */
  const getValue = useCallback(
    async (variablePath: string) => {
      const list = variablePath.split('.');
      const variableName = list[0];
      let current = ctxRef.current;
      let collectionName = getFieldPath(variableName);

      if (process.env.NODE_ENV !== 'production' && !ctxRef.current[variableName]) {
        throw new Error(`VariablesProvider: ${variableName} is not found`);
      }

      for (let index = 0; index < list.length; index++) {
        if (current == null) {
          return current;
        }

        const key = list[index];
        const associationField: CollectionFieldOptions = getCollectionJoinField(
          getFieldPath(list.slice(0, index + 1).join('.')),
        );
        if (Array.isArray(current)) {
          const result = current.map((item) => {
            if (item[key] == null && item.id != null) {
              if (associationField?.target) {
                return api
                  .request({
                    url: `/${collectionName}/${item.id}/${key}:${getAction(associationField.type)}`,
                  })
                  .then((data) => {
                    item[key] = data.data.data;
                    return item[key];
                  });
              }
            }
            return item[key];
          });
          current = _.flatten(await Promise.all(result));
        } else if (current[key] == null && current.id != null && associationField?.target) {
          const data = await api.request({
            url: `/${collectionName}/${current.id}/${key}:${getAction(associationField.type)}`,
          });
          current[key] = data.data.data;
          current = getValuesByPath(current, key);
        } else {
          current = getValuesByPath(current, key);
        }

        if (associationField?.target) {
          collectionName = associationField.target;
        }
      }

      return compile(_.isFunction(current) ? current() : current);
    },
    [getCollectionJoinField],
  );

  /**
   * 注册一个全局变量
   */
  const registerVariable = useCallback((variableOption: VariableOption) => {
    if (process.env.NODE_ENV !== 'production' && !isVariable(`{{${variableOption.name}}}`)) {
      throw new Error(`VariablesProvider: ${variableOption.name} is not a valid name`);
    }

    setCtx((prev) => {
      return {
        ...prev,
        [variableOption.name]: variableOption.ctx,
      };
    });
    ctxRef.current[variableOption.name] = variableOption.ctx;
    if (variableOption.collectionName) {
      variableToCollectionName[variableOption.name] = variableOption.collectionName;
    }
  }, []);

  const getVariable = useCallback((variableName: string): VariableOption => {
    if (!ctxRef.current[variableName]) {
      return null;
    }

    return {
      name: variableName,
      ctx: ctxRef.current[variableName],
      collectionName: variableToCollectionName[variableName],
    };
  }, []);

  const removeVariable = useCallback((variableName: string) => {
    setCtx((prev) => {
      const next = { ...prev };
      delete next[variableName];
      return next;
    });
    delete ctxRef.current[variableName];
    delete variableToCollectionName[variableName];
  }, []);

  const parseVariable = useCallback(
    /**
     * 将变量字符串解析为真正的值
     * @param str 变量字符串
     * @param localVariable 局部变量，解析完成后会被清除
     * @returns
     */
    async (str: string, localVariable?: VariableOption) => {
      if (!isVariable(str)) {
        return str;
      }

      let old = null;
      if (localVariable) {
        if (Array.isArray(localVariable)) {
          old = localVariable.map((item) => getVariable(item.name));
          localVariable.forEach((item) => registerVariable(item));
        } else {
          // 1. 如果有局部变量，先把全局中同名的变量取出来
          old = getVariable(localVariable.name);
          // 2. 把局部变量注册到全局，这样就可以使用了
          registerVariable(localVariable);
        }
      }

      const path = getPath(str);
      const value = await getValue(path);

      // 3. 局部变量使用完成后，需要在全局中清除
      if (localVariable) {
        if (Array.isArray(localVariable)) {
          localVariable.forEach((item) => removeVariable(item.name));
        } else {
          removeVariable(localVariable.name);
        }
      }
      // 4. 如果有同名的全局变量，把它重新注册回去
      if (old) {
        if (Array.isArray(old)) {
          old.filter(Boolean).forEach((item) => registerVariable(item));
        } else {
          registerVariable(old);
        }
      }

      return value;
    },
    [getValue, getVariable, registerVariable, removeVariable],
  );

  const getCollectionField = useCallback((variableString: string) => {
    const matches = variableString.match(REGEX_OF_VARIABLE);

    if (process.env.NODE_ENV !== 'production' && !matches) {
      throw new Error(`VariablesProvider: ${variableString} is not a variable string`);
    }

    const path = matches[0].replace(REGEX_OF_VARIABLE, '$1');

    // 当仅有一个例如 `$user` 这样的字符串时，需要拼一个假的 `collectionField` 返回
    if (!path.includes('.')) {
      return {
        target: variableToCollectionName[path],
      };
    }

    return getCollectionJoinField(getFieldPath(path));
  }, []);

  useEffect(() => {
    builtinVariables.forEach((variableOption) => {
      registerVariable(variableOption);
    });
  }, [builtinVariables, registerVariable]);

  const value = useMemo(
    () => ({
      ctx,
      setCtx,
      parseVariable,
      registerVariable,
      getVariable,
      getCollectionField,
      removeVariable,
    }),
    [ctx, getCollectionField, getVariable, parseVariable, registerVariable, removeVariable],
  );

  return <VariablesContext.Provider value={value}>{children}</VariablesContext.Provider>;
};

VariablesProvider.displayName = 'VariablesProvider';

export default VariablesProvider;
