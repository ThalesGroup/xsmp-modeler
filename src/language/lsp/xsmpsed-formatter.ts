import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmpsedFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.Path: return this.formatPath(node as ast.Path, this.getNodeFormatter(node));
            case ast.PathMember: return this.formatPathMember(node as ast.PathMember, this.getNodeFormatter(node));
            case ast.Schedule: return this.formatSchedule(node as ast.Schedule, this.getNodeFormatter(node));
            case ast.StringParameter: return this.formatTypedAssignment(this.getNodeFormatter(node));
            case ast.Int32Parameter: return this.formatTypedAssignment(this.getNodeFormatter(node));
            case ast.Task: return this.formatTask(node as ast.Task, this.getNodeFormatter(node));
            case ast.CallOperation: return this.formatCallOperation(node as ast.CallOperation, this.getNodeFormatter(node));
            case ast.SetProperty: return this.formatSetProperty(node as ast.SetProperty, this.getNodeFormatter(node));
            case ast.Transfer: return this.formatTransfer(node as ast.Transfer, this.getNodeFormatter(node));
            case ast.Trigger: return this.formatTrigger(node as ast.Trigger, this.getNodeFormatter(node));
            case ast.ExecuteTask: return this.formatExecuteTask(node as ast.ExecuteTask, this.getNodeFormatter(node));
            case ast.StringArgument: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.Int32Argument: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.EmitGlobalEvent: return this.formatEmitGlobalEvent(node as ast.EmitGlobalEvent, this.getNodeFormatter(node));
            case ast.ParameterValue: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.MissionEvent: return this.formatMissionEvent(node as ast.MissionEvent, this.getNodeFormatter(node));
            case ast.EpochEvent: return this.formatEpochEvent(node as ast.EpochEvent, this.getNodeFormatter(node));
            case ast.SimulationEvent: return this.formatSimulationEvent(node as ast.SimulationEvent, this.getNodeFormatter(node));
            case ast.ZuluEvent: return this.formatZuluEvent(node as ast.ZuluEvent, this.getNodeFormatter(node));
            case ast.GlobalEventTriggeredEvent: return this.formatGlobalEventTriggeredEvent(node as ast.GlobalEventTriggeredEvent, this.getNodeFormatter(node));
        }
    }

    protected formatSchedule(node: ast.Schedule, formatter: NodeFormatter<ast.Schedule>): void {
        formatter.keyword('schedule').prepend(Formatting.noIndent());
        this.formatSeparatedAngleList(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('epoch').surround(Formatting.oneSpace());
        formatter.keyword('mission').surround(Formatting.oneSpace());
        formatter.nodes(...node.elements).prepend(Formatting.noIndent());
    }

    protected formatTask(node: ast.Task, formatter: NodeFormatter<ast.Task>): void {
        formatter.keyword('task').append(Formatting.oneSpace());
        this.formatTypeAnnotation(formatter);
        this.formatBody(formatter);
    }

    protected formatCallOperation(node: ast.CallOperation, formatter: NodeFormatter<ast.CallOperation>): void {
        formatter.keyword('call').append(Formatting.oneSpace());
        this.formatRoundList(formatter);
    }

    protected formatSetProperty(node: ast.SetProperty, formatter: NodeFormatter<ast.SetProperty>): void {
        formatter.keyword('property').append(Formatting.oneSpace());
        this.formatAssignment(formatter);
    }

    protected formatTransfer(node: ast.Transfer, formatter: NodeFormatter<ast.Transfer>): void {
        formatter.keyword('transfer').append(Formatting.oneSpace());
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    protected formatTrigger(node: ast.Trigger, formatter: NodeFormatter<ast.Trigger>): void {
        formatter.keyword('trig').append(Formatting.oneSpace());
    }

    protected formatExecuteTask(node: ast.ExecuteTask, formatter: NodeFormatter<ast.ExecuteTask>): void {
        formatter.keyword('execute').append(Formatting.oneSpace());
        this.formatAttachedAngleList(formatter);
        formatter.keyword('at').surround(Formatting.oneSpace());
    }

    protected formatEmitGlobalEvent(node: ast.EmitGlobalEvent, formatter: NodeFormatter<ast.EmitGlobalEvent>): void {
        formatter.keyword('async').append(Formatting.oneSpace());
        formatter.keyword('emit').append(Formatting.oneSpace());
    }

    protected formatMissionEvent(node: ast.MissionEvent, formatter: NodeFormatter<ast.MissionEvent>): void {
        formatter.keyword('event').append(Formatting.oneSpace());
        formatter.keyword('mission').surround(Formatting.oneSpace());
        formatter.keyword('cycle').surround(Formatting.oneSpace());
        formatter.keyword('repeat').surround(Formatting.oneSpace());
    }

    protected formatEpochEvent(node: ast.EpochEvent, formatter: NodeFormatter<ast.EpochEvent>): void {
        formatter.keyword('event').append(Formatting.oneSpace());
        formatter.keyword('epoch').surround(Formatting.oneSpace());
        formatter.keyword('cycle').surround(Formatting.oneSpace());
        formatter.keyword('repeat').surround(Formatting.oneSpace());
    }

    protected formatSimulationEvent(node: ast.SimulationEvent, formatter: NodeFormatter<ast.SimulationEvent>): void {
        formatter.keyword('event').append(Formatting.oneSpace());
        formatter.keyword('simulation').surround(Formatting.oneSpace());
        formatter.keyword('cycle').surround(Formatting.oneSpace());
        formatter.keyword('repeat').surround(Formatting.oneSpace());
    }

    protected formatZuluEvent(node: ast.ZuluEvent, formatter: NodeFormatter<ast.ZuluEvent>): void {
        formatter.keyword('event').append(Formatting.oneSpace());
        formatter.keyword('zulu').surround(Formatting.oneSpace());
        formatter.keyword('cycle').surround(Formatting.oneSpace());
        formatter.keyword('repeat').surround(Formatting.oneSpace());
    }

    protected formatGlobalEventTriggeredEvent(node: ast.GlobalEventTriggeredEvent, formatter: NodeFormatter<ast.GlobalEventTriggeredEvent>): void {
        formatter.keyword('event').append(Formatting.oneSpace());
        formatter.keyword('on').surround(Formatting.oneSpace());
        formatter.keyword('until').surround(Formatting.oneSpace());
        formatter.keyword('using').surround(Formatting.oneSpace());
        formatter.keyword('delay').surround(Formatting.oneSpace());
        formatter.keyword('cycle').surround(Formatting.oneSpace());
        formatter.keyword('repeat').surround(Formatting.oneSpace());
    }
}
