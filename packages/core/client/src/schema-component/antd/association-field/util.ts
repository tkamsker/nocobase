import { ISchema } from '@formily/react';
import { isArr } from '@formily/shared';
import { getDefaultFormat, str2moment } from '@nocobase/utils/client';
import { Tag } from 'antd';
import { get, isFunction } from 'lodash';
import moment from 'moment';
import React from 'react';
import { CollectionFieldOptions, useCollectionManager } from '../../../collection-manager';

export const useLabelUiSchema = (collectionField: CollectionFieldOptions, label: string): ISchema => {
  const { getCollectionJoinField } = useCollectionManager();
  if (!collectionField) {
    return;
  }
  const labelField = getCollectionJoinField(`${collectionField.target}.${label}`) as CollectionFieldOptions;
  return labelField?.uiSchema;
};

export const getDatePickerLabels = (props): string => {
  const format = getDefaultFormat(props) as string;
  const m = str2moment(props.value, props) as moment.Moment;
  const labels = m && m.isValid() ? m.format(format) : props.value;
  return isArr(labels) ? labels.join('~') : labels;
};

const toArr = (v) => {
  if (!v) {
    return [];
  }
  return Array.isArray(v) ? v : [v];
};

export const getLabelFormatValue = (labelUiSchema: ISchema, value: any, isTag = false): any => {
  const options = labelUiSchema?.enum;
  if (Array.isArray(options) && value) {
    const values = toArr(value).map((val) => {
      const opt: any = options.find((option: any) => option.value === val);
      if (isTag) {
        return React.createElement(Tag, { color: opt?.color }, opt?.label);
      }
      return opt?.label;
    });
    return isTag ? values : values.join(', ');
  }
  switch (labelUiSchema?.['x-component']) {
    case 'DatePicker':
      return getDatePickerLabels({ ...labelUiSchema?.['x-component-props'], value });
    default:
      return value;
  }
};

export function flatData(data) {
  const newArr = [];
  for (let i = 0; i < data.length; i++) {
    const children = data[i]['children'];
    if (Array.isArray(children)) {
      newArr.push(...flatData(children));
    }
    newArr.push({ ...data[i] });
  }
  return newArr;
}

export function isShowFilePicker(labelUiSchema) {
  return labelUiSchema?.['x-component'] === 'Preview';
}

export const toValue = (value, placeholder) => {
  if (value === null || value === undefined) {
    return placeholder;
  }
  return value;
};

export const parseVariables = (str: string, ctx) => {
  if (str) {
    const result = get(ctx, str);
    return isFunction(result) ? result() : result;
  } else {
    return str;
  }
};
export function extractFilterfield(str) {
  const match = str.match(/^\$form\.([^.[\]]+)/);
  if (match) {
    return match[1];
  }
  return null;
}

export function extractValuesByPattern(obj, pattern) {
  const regexPattern = new RegExp(pattern.replace(/\*/g, '\\d+'));
  const result = [];

  for (const key in obj) {
    if (regexPattern.test(key)) {
      const value = obj[key];
      result.push(value);
    }
  }

  return result;
}
export function generatePattern(str, fieldName) {
  const result = str.replace(`$form.${fieldName}.`, `${fieldName}.*.`);
  return result;
}
